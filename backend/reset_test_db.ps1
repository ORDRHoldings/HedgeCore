# reset_test_db.ps1
# Fully rebuild HedgeCalc test environment (main + test DB)

Write-Host "🧠 Resetting HedgeCalc test environment..."

$PGUSER = "postgres"
$PGPASSWORD = "postgres"
$DB_MAIN = "hedgecalc"
$DB_TEST = "hedgecalc_test"

# Drop both DBs completely
Write-Host "Dropping old databases if exist..."
psql -U $PGUSER -c "DROP DATABASE IF EXISTS $DB_MAIN;" 2>$null
psql -U $PGUSER -c "DROP DATABASE IF EXISTS $DB_TEST;" 2>$null

# Recreate both
Write-Host "Creating fresh databases..."
psql -U $PGUSER -c "CREATE DATABASE $DB_MAIN;"
psql -U $PGUSER -c "CREATE DATABASE $DB_TEST;"

Write-Host "✅ Both databases reset successfully."
