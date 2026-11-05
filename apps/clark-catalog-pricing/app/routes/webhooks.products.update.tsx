import type { ActionFunctionArgs } from "react-router";
import { syncProduct } from "../lib/sync.server";
import { authenticate } from "../shopify.server";

type ProductPayload = {
  admin_graphql_api_id: string;
  title: string;
  variants: { admin_graphql_api_id: string; price: string }[];
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, admin, payload } = await authenticate.webhook(request);
  if (!admin) return new Response();

  const product = payload as ProductPayload;
  await syncProduct(
    admin,
    shop,
    product.admin_graphql_api_id,
    product.title,
    product.variants.map((variant) => ({
      id: variant.admin_graphql_api_id,
      price: variant.price,
    })),
  );

  return new Response();
};
