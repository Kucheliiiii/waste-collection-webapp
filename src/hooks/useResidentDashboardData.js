import { useQuery } from '@tanstack/react-query';
import apiService from '../services/apiService';

const REFRESH_INTERVAL_MS = 15000;

export function useResidentDashboardData(residentUserId) {
  const enabled = Boolean(residentUserId);

  const summaryQuery = useQuery({
    queryKey: ['resident-dashboard-summary', residentUserId],
    queryFn: () => apiService.getResidentDashboardSummary(residentUserId),
    enabled,
    refetchInterval: REFRESH_INTERVAL_MS,
    staleTime: 5000,
  });

  const recentActivitiesQuery = useQuery({
    queryKey: ['resident-recent-activities', residentUserId],
    queryFn: () => apiService.getResidentRecentActivities(residentUserId, 6),
    enabled,
    refetchInterval: REFRESH_INTERVAL_MS,
    staleTime: 5000,
  });

  const monthlyStatsQuery = useQuery({
    queryKey: ['resident-monthly-stats', residentUserId],
    queryFn: () => apiService.getResidentMonthlyStats(residentUserId, 6),
    enabled,
    refetchInterval: REFRESH_INTERVAL_MS,
    staleTime: 5000,
  });

  return {
    summaryQuery,
    recentActivitiesQuery,
    monthlyStatsQuery,
    isLoading: summaryQuery.isLoading || recentActivitiesQuery.isLoading || monthlyStatsQuery.isLoading,
    isError: summaryQuery.isError || recentActivitiesQuery.isError || monthlyStatsQuery.isError,
    error: summaryQuery.error || recentActivitiesQuery.error || monthlyStatsQuery.error,
  };
}
