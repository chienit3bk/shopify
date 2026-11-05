import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { Form, redirect, useActionData, useLoaderData, useNavigation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import db from "../db.server";
import { validateRule } from "../lib/pricing";
import { deleteCatalog, provisionCatalog, syncRule } from "../lib/sync.server";
import { authenticate } from "../shopify.server";

type Setup = {
  shop: { currencyCode: string };
  companyLocations: {
    nodes: { id: string; name: string; company: { name: string } }[];
  };
  collections: { nodes: { id: string; title: string }[] };
};

const SETUP_QUERY = `#graphql
  query Setup {
    shop { currencyCode }
    companyLocations(first: 50) {
      nodes { id name company { name } }
    }
    collections(first: 50, sortKey: TITLE) {
      nodes { id title }
    }
  }`;

async function loadSetup(admin: {
  graphql: (query: string) => Promise<Response>;
}) {
  const response = await admin.graphql(SETUP_QUERY);
  const { data } = (await response.json()) as { data: Setup };
  return data;
}

const locationLabel = (location: Setup["companyLocations"]["nodes"][number]) =>
  `${location.company.name} / ${location.name}`;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  return loadSetup(admin);
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const form = await request.formData();
  const collectionId = String(form.get("collectionId") ?? "") || null;
  const input = {
    name: String(form.get("name") ?? "").trim(),
    companyLocationId: String(form.get("companyLocationId") ?? ""),
    percentOff: Number(form.get("percentOff")),
    collectionId,
    collectionPercentOff: collectionId
      ? Number(form.get("collectionPercentOff"))
      : null,
  };

  const invalid = validateRule(input);
  if (invalid) return { error: invalid };

  const taken = await db.pricingRule.findUnique({
    where: {
      shop_companyLocationId: {
        shop: session.shop,
        companyLocationId: input.companyLocationId,
      },
    },
  });
  if (taken) return { error: `This location already uses "${taken.name}".` };

  const setup = await loadSetup(admin);
  const location = setup.companyLocations.nodes.find(
    (node) => node.id === input.companyLocationId,
  );
  if (!location) return { error: "Company location not found." };

  try {
    const currency = setup.shop.currencyCode;
    const ids = await provisionCatalog(admin, { ...input, currency });
    try {
      const rule = await db.pricingRule.create({
        data: {
          ...input,
          ...ids,
          shop: session.shop,
          currency,
          companyLocationName: locationLabel(location),
          collectionTitle:
            setup.collections.nodes.find((node) => node.id === collectionId)
              ?.title ?? null,
        },
      });
      await syncRule(admin, rule);
      return redirect(`/app/rules/${rule.id}`);
    } catch (error) {
      await db.pricingRule.deleteMany({
        where: { shop: session.shop, catalogId: ids.catalogId },
      });
      await deleteCatalog(admin, ids.catalogId);
      throw error;
    }
  } catch (error) {
    return { error: (error as Error).message };
  }
};

export default function NewRule() {
  const { companyLocations, collections } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const saving = useNavigation().state === "submitting";

  return (
    <s-page heading="Create price rule" inlineSize="small">
      <s-link slot="breadcrumb-actions" href="/app">
        Wholesale price rules
      </s-link>
      {result?.error ? (
        <s-banner tone="critical" heading="Rule not saved">
          {result.error}
        </s-banner>
      ) : null}

      <Form method="post">
        <s-stack gap="base">
          <s-section heading="Who gets these prices">
            <s-stack gap="base">
              <s-text-field label="Rule name" name="name" required />
              <s-select
                label="Company location"
                name="companyLocationId"
                placeholder="Choose a location"
                required
              >
                {companyLocations.nodes.map((location) => (
                  <s-option key={location.id} value={location.id}>
                    {locationLabel(location)}
                  </s-option>
                ))}
              </s-select>
            </s-stack>
          </s-section>

          <s-section heading="Prices">
            <s-stack gap="base">
              <s-number-field
                label="Catalog discount (%)"
                name="percentOff"
                min={1}
                max={99}
                required
              />
              <s-select
                label="Collection override"
                name="collectionId"
                placeholder="No override"
                details="Variants in this collection get fixed prices that follow retail price changes."
              >
                {collections.nodes.map((collection) => (
                  <s-option key={collection.id} value={collection.id}>
                    {collection.title}
                  </s-option>
                ))}
              </s-select>
              <s-number-field
                label="Collection discount (%)"
                name="collectionPercentOff"
                min={1}
                max={99}
              />
            </s-stack>
          </s-section>

          <s-button type="submit" variant="primary" loading={saving}>
            Create rule
          </s-button>
        </s-stack>
      </Form>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
