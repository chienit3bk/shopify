import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { Form, redirect, useActionData, useLoaderData, useNavigation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import db from "../db.server";
import { deleteCatalog, pricePreview, syncRule } from "../lib/sync.server";
import { authenticate } from "../shopify.server";

async function findRule(shop: string, id: string | undefined) {
  const rule = await db.pricingRule.findFirst({
    where: { id: Number(id), shop },
  });
  if (!rule) throw new Response("Rule not found", { status: 404 });
  return rule;
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const rule = await findRule(session.shop, params.id);
  const preview = await pricePreview(admin, rule.companyLocationId);
  return { rule, preview };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const rule = await findRule(session.shop, params.id);
  const intent = (await request.formData()).get("intent");

  try {
    if (intent === "delete") {
      await deleteCatalog(admin, rule.catalogId);
      await db.pricingRule.delete({ where: { id: rule.id } });
      return redirect("/app");
    }
    await syncRule(admin, rule);
    return { synced: true, error: null };
  } catch (error) {
    return { synced: false, error: (error as Error).message };
  }
};

const money = (amount: string, currency: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
    Number(amount),
  );

const percentSaved = (retail: string, wholesale: string) =>
  Math.round((1 - Number(wholesale) / Number(retail)) * 100);

export default function RuleDetail() {
  const { rule, preview } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const busy = useNavigation().state === "submitting";

  return (
    <s-page heading={rule.name}>
      <s-link slot="breadcrumb-actions" href="/app">
        Wholesale price rules
      </s-link>
      {result?.error ? (
        <s-banner tone="critical" heading="Action failed">
          {result.error}
        </s-banner>
      ) : null}
      {result?.synced ? (
        <s-banner tone="success" heading="Prices synced" dismissible />
      ) : null}

      <s-section heading="Rule">
        <s-stack gap="small">
          <s-text>Company location: {rule.companyLocationName}</s-text>
          <s-text>Catalog discount: {rule.percentOff}% off</s-text>
          <s-text>
            Collection override:{" "}
            {rule.collectionTitle
              ? `${rule.collectionTitle}, ${rule.collectionPercentOff}% off, ${rule.fixedPriceCount} variants`
              : "None"}
          </s-text>
          <s-stack direction="inline" gap="small">
            <Form method="post">
              <input type="hidden" name="intent" value="sync" />
              <s-button type="submit" loading={busy}>
                Sync now
              </s-button>
            </Form>
            <Form method="post">
              <input type="hidden" name="intent" value="delete" />
              <s-button type="submit" tone="critical" disabled={busy}>
                Delete rule
              </s-button>
            </Form>
          </s-stack>
        </s-stack>
      </s-section>

      <s-section heading="Live prices from Shopify" padding="none">
        <s-table>
          <s-table-header-row>
            <s-table-header listSlot="primary">Product</s-table-header>
            <s-table-header listSlot="labeled" format="currency">
              Retail
            </s-table-header>
            <s-table-header listSlot="labeled" format="currency">
              This company pays
            </s-table-header>
            <s-table-header listSlot="labeled">Saving</s-table-header>
          </s-table-header-row>
          <s-table-body>
            {preview.map((row) => (
              <s-table-row key={row.id}>
                <s-table-cell>{row.title}</s-table-cell>
                <s-table-cell>{money(row.retail, row.currency)}</s-table-cell>
                <s-table-cell>{money(row.wholesale, row.currency)}</s-table-cell>
                <s-table-cell>
                  <s-badge tone="info">
                    {percentSaved(row.retail, row.wholesale)}% off
                  </s-badge>
                </s-table-cell>
              </s-table-row>
            ))}
          </s-table-body>
        </s-table>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
