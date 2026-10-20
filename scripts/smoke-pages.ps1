param([int]$Port = 3000)
$ErrorActionPreference = "Stop"
$base = "http://localhost:$Port"
$csrf = ((Invoke-WebRequest -Uri "$base/api/auth/csrf" -SessionVariable sess -SkipHttpErrorCheck).Content | ConvertFrom-Json).csrfToken
Invoke-WebRequest -Uri "$base/api/auth/callback/credentials" -Method POST -Body @{ csrfToken = $csrf; email = "admin@store.com"; password = "admin123"; json = "true" } -WebSession $sess -SkipHttpErrorCheck | Out-Null

$paths = @("/", "/customers", "/pos", "/sales", "/dues", "/reports", "/inventory", "/labels")

# Probe the detail routes with whatever real ids the list pages expose.
$customerId = [regex]::Match((Invoke-WebRequest -Uri "$base/customers" -WebSession $sess -SkipHttpErrorCheck).Content, 'customers/(cm[a-z0-9]{20,})').Groups[1].Value
if ($customerId) { $paths += "/customers/$customerId" }

$labelsHtml = (Invoke-WebRequest -Uri "$base/labels" -WebSession $sess -SkipHttpErrorCheck).Content
$productId = [regex]::Match($labelsHtml, 'name="ids" value="(cm[a-z0-9]{20,})').Groups[1].Value
if ($productId) { $paths += "/labels/print?ids=$productId&per=2" }
$paths += "/purchases/new?from=lowstock&supplier=all"

foreach ($path in $paths) {
  $r = Invoke-WebRequest -Uri "$base$path" -WebSession $sess -SkipHttpErrorCheck
  $bad = $r.Content -match "Unknown argument|PrismaClientValidationError|could not be loaded|Application error"
  Write-Output ("{0,-46} status={1}  len={2}  pageError={3}" -f $path, $r.StatusCode, $r.Content.Length, $bad)
}

# Markers that prove the new features actually rendered, not just returned 200.
$markers = @{
  "/dues"                                  = "Aging|Not yet due"
  "/reports"                               = "Top products|Gross"
  "/labels"                                = "Print labels"
  "/inventory"                             = "Draft purchase order"
}
foreach ($entry in $markers.GetEnumerator()) {
  $html = (Invoke-WebRequest -Uri "$base$($entry.Key)" -WebSession $sess -SkipHttpErrorCheck).Content
  $found = $html -match $entry.Value
  Write-Output ("marker {0,-14} in {1,-12} -> {2}" -f $entry.Value, $entry.Key, $found)
}

if ($productId) {
  $sheet = (Invoke-WebRequest -Uri "$base/labels/print?ids=$productId&per=2" -WebSession $sess -SkipHttpErrorCheck).Content
  Write-Output ("barcode svg rendered -> {0}" -f ($sheet -match 'aria-label="Barcode'))
  Write-Output ("label count -> {0}" -f ([regex]::Matches($sheet, 'class="label-cell')).Count)
}
