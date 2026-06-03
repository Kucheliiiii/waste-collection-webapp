import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import ResidentMetricCard from './ResidentMetricCard';

const POINT_GOAL_FALLBACK = 1000;

function toTitleCase(input) {
  return String(input || '')
    .replace(/_/g, ' ')
    .replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1));
}

function ResidentOverviewPanel({ summary, recentActivities, monthlyStats }) {
  const total = Number(summary?.totalPickups || 0);
  const completed = Number(summary?.completed || 0);
  const scheduled = Number(summary?.scheduled || 0);
  const pending = Number(summary?.pending || 0);
  const ecoPoints = Number(summary?.ecoPoints || 0);
  const rewardGoal = Number(summary?.rewardGoal || POINT_GOAL_FALLBACK);
  const pointsRemaining = Math.max(0, rewardGoal - ecoPoints);

  const emptyState = total === 0;

  return (
    <div className="resident-overview-wrap">
      <h2>Dashboard Overview</h2>

      {emptyState ? (
        <div className="resident-empty-state">
          <h3>No pickup activity yet</h3>
          <p>Start recycling to earn eco points and unlock badges.</p>
        </div>
      ) : null}

      <div className="resident-metric-grid">
        <ResidentMetricCard
          title="Total Pickups"
          value={total}
          subtitle={`${completed} done, ${scheduled} scheduled, ${pending} pending`}
          tooltipText="All pickups are computed from your resident activity history."
          breakdown={[
            { name: 'Completed', value: completed },
            { name: 'Scheduled', value: scheduled },
            { name: 'Pending', value: pending },
          ]}
          colors={['#0d9488', '#f97316', '#cbd5e1']}
        />

        <ResidentMetricCard
          title="Eco Points"
          value={ecoPoints}
          subtitle={`${rewardGoal} points reward goal`}
          tooltipText="Eco points are summed from completed activities with waste-type rewards."
          breakdown={[
            { name: 'Earned', value: ecoPoints },
            { name: 'Remaining', value: pointsRemaining },
          ]}
          colors={['#5b6bc0', '#d4d4d4']}
        />

        <ResidentMetricCard
          title="Scheduled"
          value={scheduled}
          subtitle="Future or pending pickups"
          tooltipText="Scheduled pickups are requests that are pending and dated today or later."
          breakdown={[
            { name: 'Scheduled', value: scheduled },
            { name: 'Other', value: Math.max(0, total - scheduled) },
          ]}
          colors={['#f97316', '#d4d4d4']}
        />

        <ResidentMetricCard
          title="Completed"
          value={completed}
          subtitle="Finished pickups"
          tooltipText="Completed pickups are confirmed collections."
          breakdown={[
            { name: 'Completed', value: completed },
            { name: 'Other', value: Math.max(0, total - completed) },
          ]}
          colors={['#2ea89d', '#d4d4d4']}
        />
      </div>

      <div className="resident-analytics-grid">
        <div className="resident-panel-card">
          <h3>Monthly Pickups and Points</h3>
          <div className="resident-chart-wrap">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={monthlyStats}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="month" />
                <YAxis yAxisId="left" />
                <YAxis yAxisId="right" orientation="right" />
                <Tooltip />
                <Legend />
                <Bar yAxisId="left" dataKey="pickups" fill="#0d9488" name="Pickups" radius={[8, 8, 0, 0]} />
                <Bar yAxisId="right" dataKey="ecoPoints" fill="#5b6bc0" name="Eco Points" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="resident-panel-card">
          <h3>Recent Activity</h3>
          <div className="resident-activity-list">
            {recentActivities.length === 0 ? (
              <p className="resident-empty-copy">No activities yet. Create your first pickup request.</p>
            ) : (
              recentActivities.map((activity) => (
                <div className="resident-activity-item" key={activity.requestId}>
                  <div>
                    <p className="resident-activity-title">{toTitleCase(activity.wasteType)}</p>
                    <p className="resident-activity-meta">
                      {toTitleCase(activity.status)} - {new Date(activity.pickupDate).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="resident-activity-right">
                    {activity.earnedPoints > 0 ? <p className="resident-points">+{activity.earnedPoints} Points</p> : null}
                    {activity.rewardBadge ? <span className="resident-badge">{activity.rewardBadge}</span> : null}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="resident-panel-card">
        <h3>Pickup and Point Trends</h3>
        <div className="resident-chart-wrap">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={monthlyStats}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="pickups" stroke="#0d9488" strokeWidth={3} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="ecoPoints" stroke="#5b6bc0" strokeWidth={3} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

export default ResidentOverviewPanel;
