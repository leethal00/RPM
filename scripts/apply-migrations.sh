#!/bin/bash

# RPM Database Migration Applier
# Applies all migrations to a Supabase database via SQL concatenation

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🗃️  RPM Database Migration Applier"
echo "=================================="
echo ""

# Check for required environment variables
if [ -z "$NEXT_PUBLIC_SUPABASE_URL" ]; then
    echo -e "${RED}❌ Error: NEXT_PUBLIC_SUPABASE_URL is not set${NC}"
    echo ""
    echo "Usage:"
    echo "  NEXT_PUBLIC_SUPABASE_URL=<url> SUPABASE_SERVICE_ROLE_KEY=<key> ./scripts/apply-migrations.sh"
    echo ""
    echo "Example for dev:"
    echo "  NEXT_PUBLIC_SUPABASE_URL=<your-dev-url> \\"
    echo "  SUPABASE_SERVICE_ROLE_KEY=<your-dev-service-key> \\"
    echo "  ./scripts/apply-migrations.sh"
    exit 1
fi

if [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
    echo -e "${RED}❌ Error: SUPABASE_SERVICE_ROLE_KEY is not set${NC}"
    exit 1
fi

echo -e "${YELLOW}⚠️  WARNING: This will apply ALL migrations to:${NC}"
echo "   $NEXT_PUBLIC_SUPABASE_URL"
echo ""
read -p "Are you sure you want to continue? (yes/no): " -r
echo ""

if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
    echo "Aborted."
    exit 0
fi

# Find all migration files
MIGRATION_DIR="supabase/migrations"
MIGRATIONS=$(ls -1 $MIGRATION_DIR/*.sql 2>/dev/null | sort)

if [ -z "$MIGRATIONS" ]; then
    echo -e "${RED}❌ No migration files found in $MIGRATION_DIR${NC}"
    exit 1
fi

echo -e "${GREEN}Found migrations:${NC}"
for migration in $MIGRATIONS; do
    echo "  - $(basename $migration)"
done
echo ""

# Combine all migrations into a single SQL file
TEMP_SQL=$(mktemp)
for migration in $MIGRATIONS; do
    echo "-- Migration: $(basename $migration)" >> $TEMP_SQL
    cat $migration >> $TEMP_SQL
    echo "" >> $TEMP_SQL
    echo "" >> $TEMP_SQL
done

echo -e "${YELLOW}📤 Applying migrations via Supabase Management API...${NC}"
echo ""

# Note: Supabase doesn't have a direct SQL execution API that's easy to use from bash
# The best approach is to use the SQL Editor in the dashboard or Supabase CLI
# This script prepares the SQL for you

echo -e "${GREEN}✅ Combined SQL prepared at: $TEMP_SQL${NC}"
echo ""
echo -e "${YELLOW}To apply migrations:${NC}"
echo ""
echo "Option 1 - Use Supabase Dashboard (Recommended):"
echo "  1. Open: ${NEXT_PUBLIC_SUPABASE_URL/https:\/\//https://supabase.com/dashboard/project/}/sql"
echo "  2. Copy contents of: $TEMP_SQL"
echo "  3. Paste into SQL Editor"
echo "  4. Click 'Run'"
echo ""
echo "Option 2 - Use Supabase CLI:"
echo "  supabase db push --db-url $NEXT_PUBLIC_SUPABASE_URL"
echo ""
echo "Option 3 - View combined SQL:"
echo "  cat $TEMP_SQL"
echo ""

# Keep temp file for user to copy
echo -e "${GREEN}✨ Migration SQL file is ready!${NC}"
echo "   File will be kept at: $TEMP_SQL"
