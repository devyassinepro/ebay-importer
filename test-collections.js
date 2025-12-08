// Test script to fetch collections
import { authenticate } from "./app/shopify.server.js";

async function testCollections() {
  console.log("Testing collections fetch...");

  // You'll need to provide a valid request object with session
  // This is just to show the GraphQL query structure

  const query = `#graphql
    query getCollections {
      collections(first: 250) {
        edges {
          node {
            id
            title
          }
        }
      }
    }`;

  console.log("GraphQL Query:", query);
  console.log("\nThis query should fetch all collections from your store.");
  console.log("Check the Network tab in your browser when loading /app/settings");
}

testCollections();
