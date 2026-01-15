#!/bin/bash

# Logistics Intel - Production Deployment Script
# This script deploys the frontend to Vercel

set -e

echo "🚀 Logistics Intel - Deployment Script"
echo "=========================================="
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Please run this script from the project root."
    exit 1
fi

# Check for Vercel token
if [ -z "$VERCEL_TOKEN" ]; then
    echo "⚠️  VERCEL_TOKEN environment variable not set."
    echo ""
    echo "To deploy, you need a Vercel token."
    echo "Get one at: https://vercel.com/account/tokens"
    echo ""
    echo "Then run:"
    echo "  export VERCEL_TOKEN=your_token_here"
    echo "  ./DEPLOY.sh"
    echo ""
    echo "Or deploy directly with:"
    echo "  cd frontend && npx vercel --prod --token YOUR_TOKEN"
    exit 1
fi

echo "✅ Vercel token found"
echo ""

# Navigate to frontend
cd frontend

echo "📦 Installing dependencies..."
npm install --silent

echo "🔨 Building production bundle..."
npm run build

echo "🚀 Deploying to Vercel..."
npx vercel --prod --token "$VERCEL_TOKEN" --yes

echo ""
echo "✅ Deployment complete!"
echo ""
echo "🔍 Verification steps:"
echo "  1. Visit your production URL"
echo "  2. Test the search page"
echo "  3. Click 'View Details' on a company"
echo "  4. Check browser console for BOL pipeline logs"
echo "  5. Verify KPIs load correctly"
echo ""
