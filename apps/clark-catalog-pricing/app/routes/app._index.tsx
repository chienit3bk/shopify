import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import db from "../db.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const [rules, logs] = await Promise.all([
    db.pricingRule.findMany({
      where: { shop: session.shop },
      orderBy: { createdAt: "desc" },
    }),
    db.syncLog.findMany({
      where: { shop: session.shop },
      orderBy: { createdAt: "desc" },
      include: { rule: { select: { name: true } } },
      take: 10,
    }),
  ]);
  return { rules, logs };
};

const formatDate = (value: Date | string | null) =>
  value ? new Date(value).toLocaleString("en-US") : "Never";

export default function Index() {
  const { rules, logs } = useLoaderData<typeof loader>();

  return (
    <s-page heading="Wholesale price rules">
      <s-button slot="primary-action" variant="primary" href="/app/rules/new">
        Create rule
      </s-button>

      <s-section padding="none" accessibilityLabel="Price rules">
        {rules.length === 0 ? (
          <s-box padding="large">
            <s-stack gap="base" alignItems="center">
              <s-heading>No price rules yet</s-heading>
              <s-paragraph>
                Create a rule to give a B2B company its own catalog and prices.
              </s-paragraph>
              <s-button variant="primary" href="/app/rules/new">
                Create rule
              </s-button>
            </s-stack>
          </s-box>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">Rule</s-table-header>
              <s-table-header listSlot="labeled">Company location</s-table-header>
              <s-table-header listSlot="labeled">Catalog discount</s-table-header>
              <s-table-header listSlot="labeled">Collection override</s-table-header>
              <s-table-header listSlot="labeled">Last sync</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {rules.map((rule) => (
                <s-table-row key={rule.id}>
                  <s-table-cell>
                    <s-link href={`/app/rules/${rule.id}`}>{rule.name}</s-link>
                  </s-table-cell>
                  <s-table-cell>{rule.companyLocationName}</s-table-cell>
                  <s-table-cell>{rule.percentOff}% off</s-table-cell>
                  <s-table-cell>
                    {rule.collectionTitle
                      ? `${rule.collectionTitle}: ${rule.collectionPercentOff}% off (${rule.fixedPriceCount} variants)`
                      : "None"}
                  </s-table-cell>
                  <s-table-cell>{formatDate(rule.lastSyncedAt)}</s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>

      <s-section heading="Sync activity" padding="none">
        {logs.length === 0 ? (
          <s-box padding="base">
            <s-paragraph>No sync activity yet.</s-paragraph>
          </s-box>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">Result</s-table-header>
              <s-table-header listSlot="labeled">Rule</s-table-header>
              <s-table-header listSlot="labeled">Source</s-table-header>
              <s-table-header listSlot="labeled">Status</s-table-header>
              <s-table-header listSlot="labeled">Time</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {logs.map((log) => (
                <s-table-row key={log.id}>
                  <s-table-cell>{log.message}</s-table-cell>
                  <s-table-cell>{log.rule?.name ?? "Deleted rule"}</s-table-cell>
                  <s-table-cell>{log.source}</s-table-cell>
                  <s-table-cell>
                    <s-badge tone={log.status === "success" ? "success" : "critical"}>
                      {log.status}
                    </s-badge>
                  </s-table-cell>
                  <s-table-cell>{formatDate(log.createdAt)}</s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
