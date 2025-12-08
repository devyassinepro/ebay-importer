import { useState, useEffect } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "~/shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { prisma } from "~/db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  let settings = await prisma.appSettings.findUnique({
    where: { shop: session.shop },
  });

  if (!settings) {
    settings = await prisma.appSettings.create({
      data: { shop: session.shop },
    });
  }

  // Fetch collections for default collection selection
  const collectionsResponse = await admin.graphql(
    `#graphql
    query getCollections {
      collections(first: 250) {
        edges {
          node {
            id
            title
          }
        }
      }
    }`,
  );

  const collectionsData = await collectionsResponse.json();

  console.log("=== COLLECTIONS DEBUG ===");
  console.log("Collections Response:", JSON.stringify(collectionsData, null, 2));

  const collections = collectionsData.data?.collections?.edges?.map((edge: any) => ({
    id: edge.node.id,
    title: edge.node.title,
  })) || [];

  console.log("Mapped Collections:", collections);
  console.log("Total Collections:", collections.length);

  return { settings, collections };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  const data = {
    pricingMode: (formData.get("pricingMode") as string) || "MULTIPLIER",
    pricingValue: parseFloat((formData.get("pricingValue") as string) || "1.0"),
    defaultCollectionId: (formData.get("defaultCollectionId") as string) || null,
    autoPublish: formData.get("autoPublish") === "true",
    termsAccepted: formData.get("termsAccepted") === "true",
    termsAcceptedAt: formData.get("termsAccepted") === "true" ? new Date() : null,
  };

  await prisma.appSettings.upsert({
    where: { shop: session.shop },
    create: { shop: session.shop, ...data },
    update: data,
  });

  return { success: true };
};

export default function Settings() {
  const { settings, collections } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  console.log("=== SETTINGS COMPONENT DEBUG ===");
  console.log("Collections received:", collections);
  console.log("Collections count:", collections?.length);

  const [pricingMode, setPricingMode] = useState(settings.pricingMode);
  const [pricingValue, setPricingValue] = useState(settings.pricingValue);
  const [defaultCollectionId, setDefaultCollectionId] = useState(settings.defaultCollectionId || "");
  const [autoPublish, setAutoPublish] = useState(settings.autoPublish || false);
  const [termsAccepted, setTermsAccepted] = useState(settings.termsAccepted);

  const isLoading = fetcher.state === "submitting";

  useEffect(() => {
    if (fetcher.data?.success) {
      shopify.toast.show("Settings saved successfully!");
    }
  }, [fetcher.data, shopify]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData();
    formData.append("pricingMode", pricingMode);
    formData.append("pricingValue", pricingValue.toString());
    formData.append("defaultCollectionId", defaultCollectionId);
    formData.append("autoPublish", autoPublish.toString());
    formData.append("termsAccepted", termsAccepted.toString());
    fetcher.submit(formData, { method: "POST" });
  };

  return (
    <s-page heading="⚙️ Settings">
      <s-button slot="primary-action" href="/app">
        ← Back to Import
      </s-button>

      <s-stack direction="block" gap="base">
        {/* Header Banner */}
        <s-banner tone="info">
          <s-stack direction="block" gap="tight">
            <s-text weight="semibold">Configure your eBay Importer settings</s-text>
            <s-paragraph>
              Set up your API keys, affiliate settings, and default pricing preferences below.
            </s-paragraph>
          </s-stack>
        </s-banner>

        {/* Setup Instructions Banner */}
        <div
          style={{
            padding: "20px",
            background: "linear-gradient(135deg, #008060 0%, #00b386 100%)",
            borderRadius: "12px",
            color: "white",
            boxShadow: "0 4px 6px -1px rgba(0, 128, 96, 0.2)",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: "16px" }}>
            <div style={{ fontSize: "32px" }}>💡</div>
            <div style={{ flex: 1 }}>
              <h3 style={{ margin: "0 0 8px 0", fontSize: "18px", fontWeight: "600" }}>
                Install the eBay Buy Button in your theme
              </h3>
              <p style={{ margin: "0 0 12px 0", fontSize: "14px", opacity: 0.95, lineHeight: "1.5" }}>
                To display the "Buy on eBay" button on AFFILIATE products, you need to add the app block to your theme.
                This is a one-time setup with step-by-step instructions and a direct link to your theme editor.
              </p>
              <a
                href="/app/setup"
                style={{
                  display: "inline-block",
                  padding: "10px 20px",
                  backgroundColor: "white",
                  color: "#008060",
                  textDecoration: "none",
                  borderRadius: "6px",
                  fontSize: "14px",
                  fontWeight: "600",
                  transition: "transform 0.2s ease",
                }}
                onMouseEnter={(e) => e.currentTarget.style.transform = "scale(1.05)"}
                onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"}
              >
                📚 View Setup Instructions
              </a>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <s-stack direction="block" gap="base">
            {/* 1. Affiliate Settings */}
            {/* 2. Pricing Settings */}
            <s-section>
              <s-box padding="base" borderWidth="base" borderRadius="base" style={{ backgroundColor: "#f9fafb" }}>
                <s-stack direction="block" gap="base">
                  <s-text variant="headingMd" weight="semibold">
                    💰 Default Pricing Settings
                  </s-text>

                  <s-banner tone="info">
                    <s-paragraph>
                      These settings will be used as defaults when importing products.
                      You can override them for individual products during import.
                    </s-paragraph>
                  </s-banner>

                  <s-stack direction="block" gap="base">
                    {/* Pricing Mode Selector */}
                    <s-box>
                      <s-text weight="semibold" size="large">Pricing Method</s-text>
                      <s-stack direction="block" gap="base" style={{ marginTop: "12px" }}>
                        {/* Multiplier Option */}
                        <s-box
                          padding="base"
                          borderWidth="base"
                          borderRadius="base"
                          style={{
                            borderColor: pricingMode === "MULTIPLIER" ? "#008060" : "#e1e3e5",
                            backgroundColor: pricingMode === "MULTIPLIER" ? "#f6f6f7" : "transparent",
                            cursor: "pointer",
                          }}
                          onClick={() => setPricingMode("MULTIPLIER")}
                        >
                          <s-stack direction="inline" gap="base" align="start">
                            <input
                              type="radio"
                              name="pricingMode"
                              value="MULTIPLIER"
                              checked={pricingMode === "MULTIPLIER"}
                              onChange={() => setPricingMode("MULTIPLIER")}
                              style={{ marginTop: "3px" }}
                            />
                            <s-stack direction="block" gap="tight">
                              <s-text weight="semibold" size="large">📊 Percentage Markup</s-text>
                              <s-paragraph>
                                Multiply the eBay price by a factor. Perfect for maintaining consistent profit margins.
                              </s-paragraph>
                              <s-paragraph tone="subdued" size="small">
                                Example: 1.5 = 50% markup | 2.0 = 100% markup | 1.3 = 30% markup
                              </s-paragraph>
                            </s-stack>
                          </s-stack>
                        </s-box>

                        {/* Fixed Option */}
                        <s-box
                          padding="base"
                          borderWidth="base"
                          borderRadius="base"
                          style={{
                            borderColor: pricingMode === "FIXED" ? "#008060" : "#e1e3e5",
                            backgroundColor: pricingMode === "FIXED" ? "#f6f6f7" : "transparent",
                            cursor: "pointer",
                          }}
                          onClick={() => setPricingMode("FIXED")}
                        >
                          <s-stack direction="inline" gap="base" align="start">
                            <input
                              type="radio"
                              name="pricingMode"
                              value="FIXED"
                              checked={pricingMode === "FIXED"}
                              onChange={() => setPricingMode("FIXED")}
                              style={{ marginTop: "3px" }}
                            />
                            <s-stack direction="block" gap="tight">
                              <s-text weight="semibold" size="large">💵 Fixed Amount</s-text>
                              <s-paragraph>
                                Add a fixed dollar amount to the eBay price. Good for consistent profit per item.
                              </s-paragraph>
                              <s-paragraph tone="subdued" size="small">
                                Example: $10 = Add $10 to every product | $5.50 = Add $5.50 to every product
                              </s-paragraph>
                            </s-stack>
                          </s-stack>
                        </s-box>
                      </s-stack>
                    </s-box>

                    {/* Pricing Value Input */}
                    <s-text-field
                      type="number"
                      label={pricingMode === "MULTIPLIER" ? "Default Multiplier Value" : "Default Fixed Amount ($)"}
                      value={pricingValue.toString()}
                      onChange={(e: any) => setPricingValue(parseFloat(e.target.value) || 1.0)}
                      min={pricingMode === "MULTIPLIER" ? "1.0" : "0"}
                      step={pricingMode === "MULTIPLIER" ? "0.1" : "0.01"}
                      helptext={
                        pricingMode === "MULTIPLIER"
                          ? "Enter a multiplier (1.0 = no markup, 1.5 = 50% markup, 2.0 = 100% markup)"
                          : "Enter the dollar amount to add to the eBay price (e.g., 10.00 for $10)"
                      }
                    ></s-text-field>

                    {/* Pricing Preview */}
                    {pricingMode === "MULTIPLIER" && pricingValue > 1 && (
                      <s-banner tone="success">
                        <s-text>
                          <strong>Preview:</strong> eBay price of $100.00 → Your price: $
                          {(100 * pricingValue).toFixed(2)} (
                          {((pricingValue - 1) * 100).toFixed(0)}% markup)
                        </s-text>
                      </s-banner>
                    )}
                    {pricingMode === "FIXED" && pricingValue > 0 && (
                      <s-banner tone="success">
                        <s-text>
                          <strong>Preview:</strong> eBay price of $100.00 → Your price: $
                          {(100 + pricingValue).toFixed(2)} (+${pricingValue.toFixed(2)})
                        </s-text>
                      </s-banner>
                    )}
                  </s-stack>
                </s-stack>
              </s-box>
            </s-section>

            {/* 3. Product Organization Settings */}
            <s-section>
              <s-box padding="base" borderWidth="base" borderRadius="base" style={{ backgroundColor: "#f9fafb" }}>
                <s-stack direction="block" gap="base">
                  <s-text variant="headingMd" weight="semibold">
                    📂 Product Organization
                  </s-text>

                  <s-banner tone="info">
                    <s-paragraph>
                      Configure default settings for organizing imported products in your store.
                    </s-paragraph>
                  </s-banner>

                  <s-select
                    label="Default Collection"
                    value={defaultCollectionId}
                    onChange={(e: any) => setDefaultCollectionId(e.target.value)}
                    helptext="New products will be automatically added to this collection"
                  >
                    <option value="">-- No Default Collection --</option>
                    {collections.map((c: any) => (
                      <option key={c.id} value={c.id}>
                        {c.title}
                      </option>
                    ))}
                  </s-select>

                  <s-divider />

                  <s-checkbox
                    checked={autoPublish}
                    onChange={(e: any) => setAutoPublish(e.target.checked)}
                  >
                    <s-text weight="semibold">Auto-publish imported products</s-text>
                  </s-checkbox>

                  <s-banner tone={autoPublish ? "warning" : "info"}>
                    <s-stack direction="block" gap="tight">
                      {autoPublish ? (
                        <>
                          <s-text weight="semibold">⚠️ Auto-publish is enabled</s-text>
                          <s-paragraph size="small">
                            Products will be immediately visible to customers after import.
                            Make sure you review product details carefully before importing.
                          </s-paragraph>
                        </>
                      ) : (
                        <>
                          <s-text weight="semibold">ℹ️ Products will be saved as drafts</s-text>
                          <s-paragraph size="small">
                            Imported products will be saved as drafts, giving you time to review
                            before making them visible to customers.
                          </s-paragraph>
                        </>
                      )}
                    </s-stack>
                  </s-banner>
                </s-stack>
              </s-box>
            </s-section>

            {/* 4. Terms & Conditions */}
            <s-section>
              <s-box padding="base" borderWidth="base" borderRadius="base" style={{ backgroundColor: "#f9fafb" }}>
                <s-stack direction="block" gap="base">
                  <s-text variant="headingMd" weight="semibold">
                    📜 Terms & Conditions
                  </s-text>

                  <s-banner tone="warning">
                    <s-paragraph>
                      By using this application, you acknowledge that you have read and agree to comply with all
                      applicable laws and eBay's policies regarding product imports and resale.
                    </s-paragraph>
                  </s-banner>

                  <s-checkbox
                    checked={termsAccepted}
                    onChange={(e: any) => setTermsAccepted(e.target.checked)}
                  >
                    <s-text weight="semibold">
                      I accept the Terms & Conditions for importing eBay products
                    </s-text>
                  </s-checkbox>

                  {termsAccepted && settings.termsAcceptedAt && (
                    <s-banner tone="success">
                      <s-paragraph size="small">
                        ✅ Terms accepted on: {new Date(settings.termsAcceptedAt).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </s-paragraph>
                    </s-banner>
                  )}
                </s-stack>
              </s-box>
            </s-section>

            {/* Save Button */}
            <s-section>
              <s-stack direction="inline" gap="base" align="end">
                <s-button
                  type="submit"
                  variant="primary"
                  {...(isLoading ? { loading: true } : {})}
                >
                  💾 Save Settings
                </s-button>
                <s-button href="/app" variant="plain">
                  Cancel
                </s-button>
              </s-stack>
            </s-section>
          </s-stack>
        </form>
      </s-stack>
    </s-page>
  );
}

export const headers = boundary.headers;
