import axios from "axios";
import type {
  ScrapedProduct,
  ProductVariant,
  ProductOption,
  EbayScraperError as EbayScraperErrorType,
} from "~/types";

/**
 * eBay API Response Structure
 */
interface EbayApiResponse {
  original_status: number;
  pc_status: number;
  url: string;
  domain_complexity: string;
  body: {
    title: string;
    price: {
      value: number;
      currency: string;
    };
    url: string;
    sellersDescriptionURL?: string;
    notification?: string;
    breadCrumbs?: Array<{
      name: string;
      link: string;
    }>;
    condition?: string;
    mainImage?: string;
    images?: string[];
    ratings?: string;
    reviewsCount?: string;
    options?: any[];
    availableQuantity?: number;
    soldQuantity?: number;
    soldFeedbackUrl?: string;
    soldHistory?: string;
    buyerSatisfaction?: string;
    watchersCount?: number;
    shippingSummary?: string;
    location?: string;
    shipsTo?: string;
    delivery?: string;
    payments?: string[];
    returns?: string;
    description?: string;
    sellerInformation?: {
      id: string;
      sellerName: string;
      url: string;
      feedbackScore: number;
      feedbackUrl: string;
    };
    productInformation?: Array<{
      name: string;
      value: string;
    }>;
    detailedDescription?: any[];
  };
}

/**
 * Parse price string to number
 * Handles various formats: "$15.90", "15,90", "15.90 MAD", etc.
 */
function parsePrice(priceString: string | number | undefined): number {
  if (!priceString) return 0;

  // Convert to string and remove currency symbols and letters
  const cleanPrice = String(priceString)
    .replace(/[^0-9.,]/g, "") // Keep only numbers, dots, and commas
    .replace(/,(\d{3})/g, "$1") // Remove thousand separators (1,000 -> 1000)
    .replace(",", "."); // Replace decimal comma with dot (15,90 -> 15.90)

  const price = parseFloat(cleanPrice) || 0;

  return price;
}

/**
 * Extracts eBay product data using RapidAPI
 * @param ebayUrl - The eBay product URL
 * @param apiKey - RapidAPI key (optional, uses env variable if not provided)
 * @returns Product data or error
 */
export async function scrapeEbayProduct(
  ebayUrl: string,
  apiKey: string | null = null,
): Promise<{ success: boolean; data?: ScrapedProduct; error?: string }> {
  try {
    // Validate URL
    if (!ebayUrl.includes("ebay.")) {
      throw createScraperError("Invalid eBay URL", "INVALID_URL");
    }

    // Extract item ID from URL
    const itemId = extractItemId(ebayUrl);

    if (!itemId) {
      throw createScraperError(
        "Could not extract Item ID from URL",
        "INVALID_URL",
      );
    }

    // Use provided API key or fallback to environment variable
    const rapidApiKey = apiKey || process.env.RAPIDAPI_KEY;

    if (!rapidApiKey) {
      throw createScraperError(
        "RapidAPI key is required. Please add it in Settings or set RAPIDAPI_KEY environment variable.",
        "API_KEY_MISSING",
      );
    }

    console.log("=== EBAY SCRAPER DEBUG ===");
    console.log("eBay URL:", ebayUrl);
    console.log("Item ID:", itemId);

    // Fetch product data from RapidAPI
    const response = await axios.post<EbayApiResponse>(
      "https://real-time-ebay-data.p.rapidapi.com/product.php",
      {
        url: ebayUrl,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "x-rapidapi-host": "real-time-ebay-data.p.rapidapi.com",
          "x-rapidapi-key": rapidApiKey,
        },
        timeout: 30000,
      }
    );

    console.log("API Response Status:", response.data.original_status);
    console.log("PC Status:", response.data.pc_status);

    if (response.data.original_status !== 200 || response.data.pc_status !== 200) {
      throw createScraperError(
        "Failed to fetch product data from eBay. Please check if the URL is valid and the product is available.",
        "API_ERROR",
      );
    }

    const apiData = response.data.body;

    // Check if API returned empty data
    if (!apiData || Object.keys(apiData).length === 0) {
      throw createScraperError(
        "Product not found. This could mean: 1) The item doesn't exist or is no longer available on eBay, 2) Your RapidAPI key has reached its request limit. Please check your RapidAPI dashboard at https://rapidapi.com/hub and verify your subscription status.",
        "API_ERROR",
      );
    }

    // Check if we have essential product data
    const hasTitle = apiData.title;
    const hasPrice = apiData.price?.value;

    if (!hasTitle || !hasPrice) {
      throw createScraperError(
        "Incomplete product data received from eBay. The product may not be available for sale. Please try a different product URL.",
        "API_ERROR",
      );
    }

    // Parse price
    const basePrice = apiData.price.value || 0;

    // Format images - filter and clean image URLs
    const images = apiData.images
      ? apiData.images
          .filter((img: string) => img && img.startsWith("http"))
          .map((img: string) => {
            // Convert thumbnail URLs to high resolution
            if (img.includes("/s-l") && img.includes(".jpg")) {
              return img.replace(/\/s-l\d+\./, "/s-l1600.");
            }
            return img;
          })
      : apiData.mainImage
      ? [apiData.mainImage]
      : [];

    // Format description
    let description = apiData.description || "";

    // Add product information as description if no description
    if (!description && apiData.productInformation) {
      description = apiData.productInformation
        .map((info) => `${info.name}: ${info.value}`)
        .join("\n");
    }

    // Format variants from options (if any)
    const variantsData = formatEbayVariants(apiData.options || []);

    // Parse ratings
    const rating = apiData.ratings ? parseFloat(apiData.ratings) : undefined;
    const reviewsCount = apiData.reviewsCount ? parseInt(apiData.reviewsCount.replace(/,/g, "")) : undefined;

    // Extract categories from breadcrumbs
    const categories = apiData.breadCrumbs?.map((crumb) => crumb.name) || [];

    console.log("Parsed price:", basePrice);
    console.log("Number of images:", images.length);
    console.log("Number of variants:", variantsData.variants.length);
    console.log("Number of options:", variantsData.options.length);
    console.log("Rating:", rating);
    console.log("Reviews:", reviewsCount);

    // Transform API response to our format
    const productData: ScrapedProduct = {
      itemId: itemId,
      title: apiData.title,
      description: description || "No description available",
      price: basePrice,
      currency: apiData.price.currency || "USD",
      images: images,
      options: variantsData.options,
      variants: variantsData.variants.map((variant) => ({
        ...variant,
        price: variant.price || basePrice,
      })),
      ebayUrl: apiData.url || ebayUrl,
      specifications: apiData.productInformation
        ? Object.fromEntries(
            apiData.productInformation.map((info) => [info.name, info.value])
          )
        : undefined,
      bulletPoints: apiData.productInformation?.map((info) => `${info.name}: ${info.value}`),
      rating: rating,
      ratingsTotal: reviewsCount,
      categories: categories,
      availability: apiData.availableQuantity
        ? `${apiData.availableQuantity} available`
        : apiData.condition || "Available",
    };

    return {
      success: true,
      data: productData,
    };
  } catch (error) {
    console.error("Error fetching eBay product:", error);

    if (axios.isAxiosError(error)) {
      const message = error.response?.data?.message || error.message;
      return {
        success: false,
        error: `Failed to fetch eBay product: ${message}`,
      };
    }

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to fetch eBay product data",
    };
  }
}

/**
 * Format eBay variants from options array
 * eBay API format: [{ "Color": { "values": ["Black", "Pink"], "selectedValue": "" } }]
 */
function formatEbayVariants(options: any[]): {
  options: ProductOption[];
  variants: ProductVariant[];
} {
  // If no options, return empty arrays (single variant product)
  if (!options || options.length === 0) {
    return { options: [], variants: [] };
  }

  const productOptions: ProductOption[] = [];
  const allOptionValues: Array<{ name: string; values: string[] }> = [];

  // Parse the eBay options format
  options.forEach((optionObj: any) => {
    // Each option is an object like: { "Color": { "values": [...], "selectedValue": "" } }
    Object.entries(optionObj).forEach(([optionName, optionData]: [string, any]) => {
      if (optionData && optionData.values && Array.isArray(optionData.values)) {
        // Filter out "Out of stock" variants
        const availableValues = optionData.values
          .map((v: string) => v.trim())
          .filter((v: string) => !v.toLowerCase().includes("out of stock"));

        if (availableValues.length > 0) {
          productOptions.push({
            name: optionName,
            values: availableValues,
          });

          allOptionValues.push({
            name: optionName,
            values: availableValues,
          });
        }
      }
    });
  });

  // Generate all variant combinations
  const variants: ProductVariant[] = [];

  if (allOptionValues.length === 0) {
    return { options: [], variants: [] };
  }

  // Generate cartesian product of all option values
  const generateCombinations = (optionIndex: number, currentOptions: Record<string, string>): void => {
    if (optionIndex >= allOptionValues.length) {
      // All options selected, create variant
      variants.push({
        itemId: "",
        options: { ...currentOptions },
        available: true,
      });
      return;
    }

    const currentOption = allOptionValues[optionIndex];
    for (const value of currentOption.values) {
      generateCombinations(optionIndex + 1, {
        ...currentOptions,
        [currentOption.name]: value,
      });
    }
  };

  generateCombinations(0, {});

  console.log(`Generated ${variants.length} variants from ${productOptions.length} options`);
  console.log("Options:", JSON.stringify(productOptions, null, 2));
  console.log("Sample variants:", JSON.stringify(variants.slice(0, 3), null, 2));

  return { options: productOptions, variants };
}

/**
 * Extract Item ID from eBay URL
 * eBay item IDs are typically in the format: /itm/123456789
 */
function extractItemId(url: string): string | null {
  // eBay item ID pattern: /itm/[numbers]
  const itemIdMatch = url.match(/\/itm\/(\d+)/i);
  return itemIdMatch ? itemIdMatch[1] : null;
}

/**
 * Create a scraper error with code
 */
function createScraperError(
  message: string,
  code: EbayScraperErrorType["code"],
): Error {
  const error = new Error(message) as Error & { code: string };
  error.code = code;
  return error;
}
