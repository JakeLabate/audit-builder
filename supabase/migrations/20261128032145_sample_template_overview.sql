-- The sample's own overview. Made up, like the rest of the sample, and
-- consistent with its findings.
update public.audits set
  question = $q$What is stopping Google from crawling and indexing the full product range, and what should engineering fix first?$q$,
  objective = $q$Grow organic revenue from category and product pages by getting the whole range crawled, indexed and eligible for rich results in every market Northbeam sells to.$q$,
  commissioned_by = 'Priya Raman, Head of Ecommerce',
  due_on = '2026-09-12',
  kpis = $j$[
    {"id": "k1", "name": "Organic clicks", "unit": "clicks per month", "baseline": 412600, "as_of": "2026-08-12", "source": "Google Search Console, Performance report, last 28 days"},
    {"id": "k2", "name": "Product pages indexed", "unit": "product pages", "baseline": 21480, "as_of": "2026-08-12", "source": "Google Search Console, Pages report"},
    {"id": "k3", "name": "Crawl requests spent on indexable revenue pages", "unit": "percent of crawl budget", "baseline": 38, "as_of": "2026-08-13", "source": "Server access logs, Cloudflare Logpush, 30 days"},
    {"id": "k4", "name": "Mobile LCP on category pages", "unit": "seconds at the 75th percentile", "baseline": 4.8, "as_of": "2026-08-12", "source": "PageSpeed Insights field data, CrUX, 28 days"}
  ]$j$::jsonb,
  scope = $j${
    "hosts": ["www.northbeamoutfitters.example"],
    "markets": ["US", "CA", "UK", "DE", "FR", "AU"],
    "templates": ["Category listing", "Collection filter", "Product detail", "Internal search results", "Editorial"],
    "devices": ["Desktop", "Mobile"],
    "excluded": ["Help centre subdomain", "Careers site", "Paid landing pages under /lp/, noindexed by design and out of contract"]
  }$j$::jsonb,
  scope_note = $q$Full crawl of the www property, which serves every market Northbeam sells to. Covers indexation, crawl efficiency, structured data, internationalisation, page experience and internal linking.$q$,
  summary = $q$Northbeam's range is larger than the part Google can see. Faceted filters and internal search produce more than 53,000 crawlable duplicates, and paginated categories point their canonicals at page one, so 8,940 products have dropped out of the index. Most of Googlebot's visits go to URLs that can never rank.

The fixes are mostly template rules for platform engineering, and the first wave addresses crawl waste and the missing products together. Structured data and hreflang come next: in both cases the markup exists but breaks a rule that makes search engines ignore it.

Page speed, the consent banner and duplicated category copy matter, but they cost more and pay back later, so they sit in waves two to four.$q$,
  themes = $j$[
    {"id": "t1", "title": "Crawl budget spent on duplicates", "note": "Filters and internal search generate URLs faster than Googlebot can visit the real ones.", "finding_ids": ["d0c50000-0000-4000-8000-fffffffffff1", "d0c50000-0000-4000-8000-fffffffffff4"]},
    {"id": "t2", "title": "Products missing from the index", "note": "Pagination canonicals and orphaned pages hide part of the range from search.", "finding_ids": ["d0c50000-0000-4000-8000-fffffffffff2", "d0c50000-0000-4000-8000-fffffffffff9"]},
    {"id": "t3", "title": "Markup that search engines ignore", "note": "The markup is there, but each case breaks a rule that makes it invalid or hidden.", "finding_ids": ["d0c50000-0000-4000-8000-fffffffffff3", "d0c50000-0000-4000-8000-fffffffffff5", "d0c50000-0000-4000-8000-ffffffffff10"]},
    {"id": "t4", "title": "What a visitor sees first", "note": "Slow, blocked or repeated: the first screen of a category page works against it.", "finding_ids": ["d0c50000-0000-4000-8000-fffffffffff6", "d0c50000-0000-4000-8000-fffffffffff7", "d0c50000-0000-4000-8000-fffffffffff8"]}
  ]$j$::jsonb
where id = 'd0c50000-0000-4000-8000-0000000a0d17';
