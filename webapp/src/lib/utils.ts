/**
 * Utility functions module
 *
 * General-purpose utilities for CSS class merging and currency formatting.
 *
 * @module lib/utils
 */
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merge Tailwind CSS class names intelligently
 *
 * Combines clsx (for conditional classes) with twMerge (to resolve Tailwind conflicts).
 * Use this function to construct dynamic class names that respect Tailwind precedence.
 *
 * Tailwind classes with higher specificity will override lower ones, so you can safely
 * override styles: cn('bg-blue-500', 'bg-red-500') will result in bg-red-500.
 *
 * @param {...ClassValue[]} inputs - Variable number of class values (strings, arrays, objects, etc.)
 * @returns {string} Merged and deduplicated class string
 *
 * @example
 * cn('px-2 py-1', 'px-4')  // Returns 'py-1 px-4' (px-4 overrides px-2)
 * cn('text-sm', { 'font-bold': isActive })  // Conditional classes
 * cn(['bg-blue-500', 'rounded-lg'], 'hover:bg-blue-600')
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a number as US currency (dollars)
 *
 * Converts a numeric amount to a localized US currency string with dollar sign.
 * No decimal places are shown (whole dollar amounts only).
 *
 * @param {number} amount - The dollar amount to format
 * @returns {string} Formatted currency string (e.g., "$1,234" or "$1,234,567")
 *
 * @example
 * formatCurrency(1500)      // Returns "$1,500"
 * formatCurrency(1500.75)   // Returns "$1,501" (rounded)
 * formatCurrency(0)         // Returns "$0"
 * formatCurrency(-5000)     // Returns "-$5,000"
 */
export function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}
