/**
 * Date utility functions for ImportYeti and other date formats
 */

/**
 * Parse ImportYeti date format (DD/MM/YYYY) to ISO date string
 * @param dateString - Date in format "26/12/2025" or similar
 * @returns ISO date string "2025-12-26" or null if invalid
 */
export function parseImportYetiDate(dateString: string | null | undefined): string | null {
  if (!dateString || typeof dateString !== 'string') {
    return null;
  }

  const trimmed = dateString.trim();
  if (!trimmed) {
    return null;
  }

  // Match DD/MM/YYYY format
  const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) {
    // If it doesn't match, try to parse as-is (might already be ISO)
    const date = new Date(trimmed);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }
    return null;
  }

  const [, day, month, year] = match;
  const dayNum = parseInt(day, 10);
  const monthNum = parseInt(month, 10);
  const yearNum = parseInt(year, 10);

  // Validate ranges
  if (dayNum < 1 || dayNum > 31 || monthNum < 1 || monthNum > 12 || yearNum < 1900 || yearNum > 2100) {
    return null;
  }

  // Create date and validate it's real (e.g., not Feb 31)
  const date = new Date(yearNum, monthNum - 1, dayNum);
  if (date.getFullYear() !== yearNum || date.getMonth() !== monthNum - 1 || date.getDate() !== dayNum) {
    return null;
  }

  // Return ISO format
  return date.toISOString().split('T')[0];
}

/**
 * Format ISO date to user-friendly format
 * @param isoDate - ISO date string "2025-12-26"
 * @returns Formatted date "Dec 26, 2025" or original if invalid
 */
export function formatUserFriendlyDate(isoDate: string | null | undefined): string {
  if (!isoDate) {
    return 'Unknown';
  }

  try {
    const date = new Date(isoDate);
    if (isNaN(date.getTime())) {
      return isoDate;
    }

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  } catch {
    return isoDate;
  }
}

/**
 * Check if date is recent (within N days)
 * @param isoDate - ISO date string
 * @param daysThreshold - Number of days to consider recent (default 30)
 * @returns true if date is within threshold
 */
export function isRecentDate(isoDate: string | null | undefined, daysThreshold: number = 30): boolean {
  if (!isoDate) {
    return false;
  }

  try {
    const date = new Date(isoDate);
    if (isNaN(date.getTime())) {
      return false;
    }

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    return diffDays >= 0 && diffDays <= daysThreshold;
  } catch {
    return false;
  }
}

/**
 * Check if date is old (older than N days)
 * @param isoDate - ISO date string
 * @param daysThreshold - Number of days to consider old (default 180)
 * @returns true if date is older than threshold
 */
export function isOldDate(isoDate: string | null | undefined, daysThreshold: number = 180): boolean {
  if (!isoDate) {
    return false;
  }

  try {
    const date = new Date(isoDate);
    if (isNaN(date.getTime())) {
      return false;
    }

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    return diffDays > daysThreshold;
  } catch {
    return false;
  }
}

/**
 * Get date badge info based on recency
 * @param isoDate - ISO date string
 * @returns Badge info with label and color
 */
export function getDateBadgeInfo(isoDate: string | null | undefined): {
  label: string;
  color: 'green' | 'yellow' | 'gray' | null;
} | null {
  if (!isoDate) {
    return null;
  }

  if (isRecentDate(isoDate, 30)) {
    return {
      label: 'Recent',
      color: 'green'
    };
  }

  if (isOldDate(isoDate, 180)) {
    return {
      label: 'Inactive',
      color: 'yellow'
    };
  }

  return null;
}
