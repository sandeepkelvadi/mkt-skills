---
name: gsc-setup
description: Connect to Google Search Console with OAuth2. Inspect URLs, pull search analytics, manage sitemaps and find indexing errors. Use when the user asks for Search Console data or GSC setup.
---

# Google Search Console

## Description
Connect to Google Search Console via OAuth2, inspect URLs, fetch search analytics, manage sitemaps, diagnose indexing/crawl errors, and bulk-export performance data. Uses credentials from `.env` and caches the OAuth token locally.

## When to Activate
- User wants to check Google Search Console data
- User asks about indexing errors, crawl issues, or coverage problems
- User wants to see search analytics (clicks, impressions, queries, pages)
- User asks about sitemap status or wants to submit a sitemap
- User wants to inspect specific URLs for indexing status
- User mentions "GSC", "Search Console", or "search performance"
- User wants to export or paginate through all search data
- User wants to batch multiple GSC API calls

## Prerequisites

### 1. Google Cloud Project Setup
Before first use, the user needs:
1. A Google Cloud project with **Search Console API** enabled
2. An **OAuth 2.0 Client ID** (Desktop app type) created in APIs & Services > Credentials
3. The user's Google account added as a **test user** in OAuth consent screen (if app is in testing mode)

### 2. Environment Variables
Add to `.env` in the project root:
```
GOOGLE_CLIENT_ID=.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-
```

### 3. Python Dependencies
```bash
pip3 install google-api-python-client google-auth-oauthlib google-auth-httplib2 python-dotenv
```

## OAuth2 Scopes

| Scope | Access |
|-------|--------|
| `https://www.googleapis.com/auth/webmasters` | Read/write (sites, sitemaps, analytics) |
| `https://www.googleapis.com/auth/webmasters.readonly` | Read-only |
| `https://www.googleapis.com/auth/indexing` | URL inspection |

Use `webmasters` (not `readonly`) if you need to submit sitemaps or add/remove sites. If a token was created with `readonly` scope and you need write access, delete `.gsc_token.json` and re-authenticate with the full scope.

## Authentication Flow

First run opens a browser for OAuth consent. The token is cached to `.gsc_token.json` for subsequent runs. If the token expires, it auto-refreshes using the stored refresh token.

```python
import os
import json
from pathlib import Path
from dotenv import load_dotenv
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

load_dotenv()

SCOPES = [
    'https://www.googleapis.com/auth/webmasters',
    'https://www.googleapis.com/auth/indexing',
]
TOKEN_FILE = Path('.gsc_token.json')

def get_credentials():
    creds = None
    if TOKEN_FILE.exists():
        creds = Credentials.from_authorized_user_file(str(TOKEN_FILE), SCOPES)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            client_config = {
                "installed": {
                    "client_id": os.getenv("GOOGLE_CLIENT_ID"),
                    "client_secret": os.getenv("GOOGLE_CLIENT_SECRET"),
                    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                    "token_uri": "https://oauth2.googleapis.com/token",
                    "redirect_uris": ["http://localhost"]
                }
            }
            flow = InstalledAppFlow.from_client_config(client_config, SCOPES)
            creds = flow.run_local_server(port=8085)

        with open(TOKEN_FILE, 'w') as f:
            f.write(creds.to_json())

    return creds

def get_service():
    return build('searchconsole', 'v1', credentials=get_credentials())
```

## REST API Base

All endpoints follow: `https://www.googleapis.com/webmasters/v3/resourcePath?parameters`

The Python client abstracts this, but useful for debugging raw requests.

---

## API Operations

### List Verified Sites
```python
sites = service.sites().list().execute()
for site in sites.get('siteEntry', []):
    print(f"{site['siteUrl']} ({site['permissionLevel']})")
```

Permission levels: `siteOwner`, `siteFullUser`, `siteRestrictedUser`, `siteUnverifiedUser`.

### Add / Remove Sites
```python
# Add a site (requires verification separately)
service.sites().add(siteUrl='https://example.com/').execute()

# Remove a site
service.sites().delete(siteUrl='https://example.com/').execute()
```

---

### URL Inspection
Inspect individual URLs for indexing status, crawl info, mobile usability, and rich results.

```python
result = service.urlInspection().index().inspect(
    body={
        'inspectionUrl': 'https://example.com/page/',
        'siteUrl': 'https://example.com/'
    }
).execute()

ir = result['inspectionResult']
idx = ir['indexStatusResult']
# Key fields: verdict, coverageState, indexingState, lastCrawlTime,
#             crawledAs, robotsTxtState, pageFetchState, referringUrls

mobile = ir.get('mobileUsabilityResult', {})
# Key fields: verdict, issues[].issueType, issues[].severity

rich = ir.get('richResultsResult', {})
# Key fields: verdict, detectedItems[].richResultType, detectedItems[].issues[]
```

#### Common Coverage States (errors to watch for)
- `"Page with redirect"` — URL redirects, won't be indexed at this URL
- `"URL is unknown to Google"` — never discovered/crawled
- `"Crawled - currently not indexed"` — crawled but Google chose not to index
- `"Discovered - currently not indexed"` — known but not yet crawled
- `"Excluded by 'noindex' tag"` — page has noindex directive
- `"Blocked by robots.txt"` — robots.txt prevents crawling
- `"Soft 404"` — page exists but Google treats as 404
- `"Server error (5xx)"` — server returned error during crawl
- `"Submitted URL marked 'noindex'"` — sitemap URL has noindex
- `"Page indexed without content"` — indexed but body appears empty

---

### Search Analytics

Query search performance data. Data has a **2-3 day lag** — never query today's date.

#### Request Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `startDate` | Yes | Start of date range (YYYY-MM-DD) |
| `endDate` | Yes | End of date range (YYYY-MM-DD) |
| `dimensions` | No | Array: `query`, `page`, `country`, `device`, `searchAppearance`, `date` |
| `dimensionFilterGroups` | No | Filter conditions (see below) |
| `searchType` | No | `web` (default), `image`, `video`, `news`, `discover`, `googleNews` |
| `rowLimit` | No | Max rows per request (default 1000, max 25,000) |
| `startRow` | No | Zero-based offset for pagination |
| `aggregationType` | No | `auto` (default), `byPage`, `byProperty` |
| `dataState` | No | `final` (default) or `all` (includes fresh/unfinished data) |

#### Response Metrics (automatically returned per row)
- `clicks` — total clicks
- `impressions` — total impressions
- `ctr` — click-through rate (0.0–1.0)
- `position` — average ranking position

#### Basic Queries
```python
# By page
response = service.searchanalytics().query(
    siteUrl='https://example.com/',
    body={
        'startDate': '2026-02-19',
        'endDate': '2026-03-17',
        'dimensions': ['page'],
        'rowLimit': 25000
    }
).execute()

# By query
response = service.searchanalytics().query(
    siteUrl='https://example.com/',
    body={
        'startDate': '2026-02-19',
        'endDate': '2026-03-17',
        'dimensions': ['query'],
        'rowLimit': 25000
    }
).execute()

# Cross-tabulation (query × page)
response = service.searchanalytics().query(
    siteUrl='https://example.com/',
    body={
        'startDate': '2026-02-19',
        'endDate': '2026-03-17',
        'dimensions': ['query', 'page'],
        'rowLimit': 25000
    }
).execute()

# Each row: keys[] (one per dimension), clicks, impressions, ctr, position
```

#### Filtering
```python
response = service.searchanalytics().query(
    siteUrl='https://example.com/',
    body={
        'startDate': '2026-02-19',
        'endDate': '2026-03-17',
        'dimensions': ['query'],
        'dimensionFilterGroups': [{
            'filters': [
                {
                    'dimension': 'country',
                    'expression': 'ind'       # ISO 3166-1 alpha-3
                },
                {
                    'dimension': 'device',
                    'expression': 'MOBILE'     # MOBILE, DESKTOP, TABLET
                }
            ]
        }],
        'rowLimit': 25000
    }
).execute()
```

Filter operators (set via `operator` field): `equals` (default), `notEquals`, `contains`, `notContains`, `includingRegex`, `excludingRegex`.

#### Pagination for Large Datasets (>25K rows)

The API returns max 25,000 rows per request. Max available data is **50,000 rows per day per search type**.

```python
def fetch_all_rows(service, site_url, body):
    """Paginate through all available search analytics rows."""
    all_rows = []
    max_rows = 25000
    start_row = 0

    while True:
        body['rowLimit'] = max_rows
        body['startRow'] = start_row
        response = service.searchanalytics().query(
            siteUrl=site_url, body=body
        ).execute()

        rows = response.get('rows', [])
        if not rows:
            break

        all_rows.extend(rows)
        start_row += max_rows

        if len(rows) &lt; max_rows:
            break  # Last page

    return all_rows
```

#### Bulk Data Export Strategy

For complete data export, query **one day at a time** to stay within quotas:

```python
from datetime import date, timedelta

def export_all_data(service, site_url, start, end):
    &quot;&quot;&quot;Export all search analytics data, one day at a time.&quot;&quot;&quot;
    current = start
    all_data = []

    while current