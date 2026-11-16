/** Set only after a successful user-initiated report save, never from a URL. */
export function useAnalysisIntent() {
  return useState<{ reportId: string; revision: number } | null>('analysis-submission-intent', () => null)
}
