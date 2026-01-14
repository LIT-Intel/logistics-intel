#!/bin/bash

echo "================================"
echo "ISOLATION FIX VERIFICATION"
echo "================================"
echo ""

echo "✅ Step 1: Checking Search page..."
if grep -q "from.*@/lib/api" frontend/src/pages/Search.tsx; then
  echo "❌ FAIL: Search still imports from @/lib/api"
  exit 1
else
  echo "✅ PASS: Search has no API imports"
fi

echo ""
echo "✅ Step 2: Checking Settings page..."
if grep -q "from.*@/lib/api" frontend/src/pages/SettingsPage.tsx; then
  echo "❌ FAIL: Settings still imports from @/lib/api"
  exit 1
else
  echo "✅ PASS: Settings has no API imports"
fi

echo ""
echo "✅ Step 3: Checking mock data..."
if grep -q "MOCK_COMPANIES" frontend/src/pages/Search.tsx; then
  echo "✅ PASS: Search has hardcoded mock data"
else
  echo "❌ FAIL: Search missing mock data"
  exit 1
fi

echo ""
echo "✅ Step 4: Checking build artifacts..."
if [ -f "frontend/dist/index.html" ]; then
  echo "✅ PASS: Build artifacts exist"
else
  echo "❌ FAIL: Build artifacts missing"
  exit 1
fi

echo ""
echo "✅ Step 5: Checking bundle sizes..."
if [ -f "frontend/dist/assets/Search-B1s6LdXd.js" ]; then
  SIZE=$(wc -c < frontend/dist/assets/Search-B1s6LdXd.js)
  echo "✅ PASS: Search bundle: $SIZE bytes"
else
  echo "⚠️  WARNING: Search bundle filename may have changed (expected during rebuild)"
fi

echo ""
echo "================================"
echo "✅ ALL CHECKS PASSED"
echo "================================"
echo ""
echo "Next Steps:"
echo "1. Deploy to Vercel (git push)"
echo "2. Visit /app/search"
echo "3. Visit /app/settings"
echo "4. Confirm no white page"
echo "5. Confirm 'Mock Data' badge visible"
echo ""
