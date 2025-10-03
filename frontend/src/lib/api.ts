// src/lib/api.ts
import * as Search from "@/lib/api/search";

export const api = {
  searchCompanies: Search.searchCompanies,
};

export type {
  SearchFilters,
  SearchCompaniesResponse,
  SearchCompanyRow,
} from "@/lib/api/search";
