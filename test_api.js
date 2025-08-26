const mongoose = require('mongoose');
require('dotenv').config();

// Test what getUserUrls actually returns
async function testAPI() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Import the Url model
    const Url = require('./models/Url');

    console.log('\n=== Testing getUserUrls query simulation ===');

    // First, get the user ID from the FwH868 URL
    const fwh868Url = await Url.findOne({ shortCode: 'FwH868' });
    if (!fwh868Url) {
      console.log('❌ FwH868 URL not found');
      return;
    }

    const userId = fwh868Url.userId;
    console.log(`Using user ID: ${userId}`);

    // Simulate the exact query from getUserUrls
    const query = {
      userId: userId,
      isActive: true,
      $or: [
        { expiryDate: null },
        { expiryDate: { $gt: new Date() } }
      ]
    };

    console.log('Query:', JSON.stringify(query, null, 2));

    // Execute the same query as getUserUrls
    const urls = await Url.find(query).lean();

    console.log(`\n📊 Found ${urls.length} URLs for user`);

    const fwh868 = urls.find(url => url.shortCode === 'FwH868');
    if (fwh868) {
      console.log('\n🔍 FwH868 URL found in getUserUrls query:');
      console.log(`  - Clicks: ${fwh868.clicks}`);
      console.log(`  - User ID: ${fwh868.userId}`);
      console.log(`  - Is Active: ${fwh868.isActive}`);
      console.log(`  - Expiry Date: ${fwh868.expiryDate}`);
    } else {
      console.log('\n❌ FwH868 URL NOT found in getUserUrls query');
      console.log('This means it might not match the user ID or other query conditions');

      // Let's check what user ID the FwH868 URL actually has
      const actualUrl = await Url.findOne({ shortCode: 'FwH868' });
      if (actualUrl) {
        console.log(`\n🔍 Actual FwH868 URL data:`);
        console.log(`  - User ID: ${actualUrl.userId}`);
        console.log(`  - Is Active: ${actualUrl.isActive}`);
        console.log(`  - Expiry Date: ${actualUrl.expiryDate}`);
        console.log(`  - Clicks: ${actualUrl.clicks}`);
      }
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

testAPI();
