-- North-America cross-border Market search.
--
-- Serves the MX-region "Market" mode in the Intelligence Explorer: browse the
-- 3,924 US companies importing FROM Mexico/Canada (lit_na_import_companies,
-- aggregated from 55k lit_na_import_shipments) with the same filter surface as
-- the US market path (state, HS chapter, industry, origin, keyword). This is a
-- brand-new RPC — zero changes to pulse-explore / lit_company_directory.
--
-- SECURITY DEFINER so the goods-keyword EXISTS can scan lit_na_import_shipments
-- without depending on per-row RLS evaluation cost; both tables already allow
-- authenticated SELECT, so this widens nothing.

create or replace function public.lit_na_market_search(
  p_origin        text    default 'Mexico',
  p_states        text[]  default null,
  p_hs            text[]  default null,
  p_industry      text    default null,
  p_q             text    default null,
  p_min_shipments int     default 0,
  p_limit         int     default 300
)
returns table (
  consignee_norm    text,
  name              text,
  city              text,
  state             text,
  zip               text,
  website           text,
  industry          text,
  mx_shipments      integer,
  ca_shipments      integer,
  total_shipments   integer,
  total_teu         numeric,
  total_value_usd   numeric,
  first_arrival     date,
  last_arrival      date,
  top_hs_chapter    text,
  hs_label          text,
  top_lading_port   text,
  top_unlading_port text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.consignee_norm,
    c.name,
    c.city,
    c.state,
    c.zip,
    c.website,
    c.industry,
    c.mx_shipments,
    c.ca_shipments,
    c.total_shipments,
    c.total_teu,
    c.total_value_usd,
    c.first_arrival,
    c.last_arrival,
    c.top_hs_chapter,
    h.label as hs_label,
    c.top_lading_port,
    c.top_unlading_port
  from lit_na_import_companies c
  left join lit_hs_chapters h on h.chapter = c.top_hs_chapter
  where
    -- Origin: 'Mexico' / 'Canada' narrow to companies with lane volume from
    -- that country; null means either lane.
    (
      p_origin is null
      or (p_origin = 'Mexico' and c.mx_shipments > 0)
      or (p_origin = 'Canada' and c.ca_shipments > 0)
    )
    -- States: data stores FULL names ('Florida'), callers pass the same.
    and (p_states is null or c.state = any (p_states))
    -- HS chapter: dominant chapter match, or any shipment for this consignee
    -- in one of the requested chapters.
    and (
      p_hs is null
      or c.top_hs_chapter = any (p_hs)
      or exists (
        select 1 from lit_na_import_shipments s
        where s.consignee_norm = c.consignee_norm
          and s.hs_chapter = any (p_hs)
      )
    )
    and (p_industry is null or c.industry ilike '%' || p_industry || '%')
    -- Keyword: company name, or goods descriptions on this consignee's
    -- shipments (EXISTS capped by the consignee join — never a full scan).
    and (
      p_q is null
      or btrim(p_q) = ''
      or c.name ilike '%' || btrim(p_q) || '%'
      or exists (
        select 1 from lit_na_import_shipments s
        where s.consignee_norm = c.consignee_norm
          and s.goods ilike '%' || btrim(p_q) || '%'
      )
    )
    and c.total_shipments >= coalesce(p_min_shipments, 0)
  order by c.total_shipments desc
  limit least(greatest(coalesce(p_limit, 300), 1), 1000);
$$;

revoke all on function public.lit_na_market_search(text, text[], text[], text, text, int, int) from public;
grant execute on function public.lit_na_market_search(text, text[], text[], text, text, int, int) to authenticated;
grant execute on function public.lit_na_market_search(text, text[], text[], text, text, int, int) to service_role;
