import type { PricingRule } from "@prisma/client";
import db from "../db.server";
import { chunk, discountedPrice } from "./pricing";

type Admin = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

type UserError = { field?: string[] | null; message: string };
type Variant = { id: string; price: string };

const MAX_PRICES_PER_CALL = 250;

async function gql<T>(
  admin: Admin,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const response = await admin.graphql(query, { variables });
  const json = (await response.json()) as {
    data: T;
    errors?: { message: string }[];
  };
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data;
}

function assertNoUserErrors(errors: UserError[]) {
  if (errors.length) throw new Error(errors[0].message);
}

export async function provisionCatalog(
  admin: Admin,
  input: {
    name: string;
    companyLocationId: string;
    percentOff: number;
    currency: string;
  },
) {
  const { catalogCreate } = await gql<{
    catalogCreate: { catalog: { id: string } | null; userErrors: UserError[] };
  }>(
    admin,
    `#graphql
    mutation CatalogCreate($input: CatalogCreateInput!) {
      catalogCreate(input: $input) {
        catalog { id }
        userErrors { field message }
      }
    }`,
    {
      input: {
        title: input.name,
        status: "ACTIVE",
        context: { companyLocationIds: [input.companyLocationId] },
      },
    },
  );
  assertNoUserErrors(catalogCreate.userErrors);
  const catalogId = catalogCreate.catalog!.id;

  try {
    const { priceListCreate } = await gql<{
      priceListCreate: {
        priceList: { id: string } | null;
        userErrors: UserError[];
      };
    }>(
      admin,
      `#graphql
      mutation PriceListCreate($input: PriceListCreateInput!) {
        priceListCreate(input: $input) {
          priceList { id }
          userErrors { field message }
        }
      }`,
      {
        input: {
          name: input.name,
          currency: input.currency,
          catalogId,
          parent: {
            adjustment: { type: "PERCENTAGE_DECREASE", value: input.percentOff },
            settings: { compareAtMode: "NULLIFY" },
          },
        },
      },
    );
    assertNoUserErrors(priceListCreate.userErrors);
    return { catalogId, priceListId: priceListCreate.priceList!.id };
  } catch (error) {
    await deleteCatalog(admin, catalogId);
    throw error;
  }
}

export async function deleteCatalog(admin: Admin, catalogId: string) {
  const { catalogDelete } = await gql<{
    catalogDelete: { userErrors: UserError[] };
  }>(
    admin,
    `#graphql
    mutation DeleteCatalog($id: ID!) {
      catalogDelete(id: $id, deleteDependentResources: true) {
        deletedId
        userErrors { field message }
      }
    }`,
    { id: catalogId },
  );
  assertNoUserErrors(catalogDelete.userErrors);
}

async function collectionVariants(admin: Admin, collectionId: string) {
  const variants: Variant[] = [];
  let after: string | null = null;

  do {
    const { collection }: {
      collection: {
        products: {
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
          nodes: { variants: { nodes: Variant[] } }[];
        };
      } | null;
    } = await gql(
      admin,
      `#graphql
      query CollectionVariants($id: ID!, $after: String) {
        collection(id: $id) {
          products(first: 50, after: $after) {
            pageInfo { hasNextPage endCursor }
            nodes { variants(first: 100) { nodes { id price } } }
          }
        }
      }`,
      { id: collectionId, after },
    );
    if (!collection) throw new Error("Collection no longer exists.");
    variants.push(...collection.products.nodes.flatMap((p) => p.variants.nodes));
    after = collection.products.pageInfo.hasNextPage
      ? collection.products.pageInfo.endCursor
      : null;
  } while (after);

  return variants;
}

async function writeFixedPrices(
  admin: Admin,
  rule: PricingRule,
  variants: Variant[],
) {
  const prices = variants.map((variant) => ({
    variantId: variant.id,
    price: {
      amount: discountedPrice(variant.price, rule.collectionPercentOff ?? 0),
      currencyCode: rule.currency,
    },
  }));

  for (const batch of chunk(prices, MAX_PRICES_PER_CALL)) {
    const { priceListFixedPricesAdd } = await gql<{
      priceListFixedPricesAdd: { userErrors: UserError[] };
    }>(
      admin,
      `#graphql
      mutation FixedPrices($priceListId: ID!, $prices: [PriceListPriceInput!]!) {
        priceListFixedPricesAdd(priceListId: $priceListId, prices: $prices) {
          prices { variant { id } }
          userErrors { field message }
        }
      }`,
      { priceListId: rule.priceListId, prices: batch },
    );
    assertNoUserErrors(priceListFixedPricesAdd.userErrors);
  }
}

function log(
  rule: PricingRule,
  source: "manual" | "webhook",
  status: "success" | "error",
  message: string,
) {
  return db.syncLog.create({
    data: { shop: rule.shop, ruleId: rule.id, source, status, message },
  });
}

/** Rewrites every fixed price in the rule's collection. Catalog-wide % needs no writes. */
export async function syncRule(admin: Admin, rule: PricingRule) {
  try {
    const variants = rule.collectionId
      ? await collectionVariants(admin, rule.collectionId)
      : [];
    await writeFixedPrices(admin, rule, variants);
    await db.pricingRule.update({
      where: { id: rule.id },
      data: { fixedPriceCount: variants.length, lastSyncedAt: new Date() },
    });
    await log(rule, "manual", "success", `Synced ${variants.length} fixed prices`);
  } catch (error) {
    await log(rule, "manual", "error", (error as Error).message);
    throw error;
  }
}

/** Keeps fixed prices in step when a retail price changes (products/update webhook). */
export async function syncProduct(
  admin: Admin,
  shop: string,
  productId: string,
  productTitle: string,
  variants: Variant[],
) {
  const rules = await db.pricingRule.findMany({
    where: { shop, collectionId: { not: null } },
  });

  for (const rule of rules) {
    try {
      const { product } = await gql<{
        product: { inCollection: boolean } | null;
      }>(
        admin,
        `#graphql
        query InCollection($productId: ID!, $collectionId: ID!) {
          product(id: $productId) { inCollection(id: $collectionId) }
        }`,
        { productId, collectionId: rule.collectionId },
      );
      if (!product?.inCollection) continue;

      await writeFixedPrices(admin, rule, variants);
      await db.pricingRule.update({
        where: { id: rule.id },
        data: { lastSyncedAt: new Date() },
      });
      await log(rule, "webhook", "success", `Updated ${productTitle}`);
    } catch (error) {
      await log(rule, "webhook", "error", (error as Error).message);
    }
  }
}

export type PreviewRow = {
  id: string;
  title: string;
  retail: string;
  wholesale: string;
  currency: string;
};

export async function pricePreview(admin: Admin, companyLocationId: string) {
  const { products } = await gql<{
    products: {
      nodes: {
        title: string;
        variants: {
          nodes: {
            id: string;
            price: string;
            contextualPricing: {
              price: { amount: string; currencyCode: string };
            };
          }[];
        };
      }[];
    };
  }>(
    admin,
    `#graphql
    query Preview($context: ContextualPricingContext!) {
      products(
        first: 50
        sortKey: TITLE
        query: "status:active AND gift_card:false"
      ) {
        nodes {
          title
          variants(first: 1) {
            nodes {
              id
              price
              contextualPricing(context: $context) {
                price { amount currencyCode }
              }
            }
          }
        }
      }
    }`,
    { context: { companyLocationId } },
  );

  const rows = products.nodes.flatMap((product) =>
    product.variants.nodes.map(
      (variant): PreviewRow => ({
        id: variant.id,
        title: product.title,
        retail: variant.price,
        wholesale: variant.contextualPricing.price.amount,
        currency: variant.contextualPricing.price.currencyCode,
      }),
    ),
  );

  // Biggest savings first, so collection overrides are easy to spot.
  const paidRatio = (row: PreviewRow) =>
    Number(row.wholesale) / Number(row.retail);
  return rows.sort((a, b) => paidRatio(a) - paidRatio(b)).slice(0, 12);
}
