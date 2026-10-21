-- Keep deliberately skipped RPM sites separate from confirmed matches.
alter table public.mcdonalds_site_reviews
  drop constraint if exists mcdonalds_site_reviews_review_status_check;
alter table public.mcdonalds_site_reviews
  add constraint mcdonalds_site_reviews_review_status_check
  check (review_status in ('pending', 'verified', 'xero_issue', 'skipped'));
