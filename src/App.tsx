import React, { useState, useEffect } from 'react';
import { BarChart as LucideBarChart, Activity, Users, Clock, ArrowUpRight } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';
import { format, subDays } from 'date-fns';

// API配置
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// 类型定义
interface Metrics {
  totalVisits: number;
  last24Hours: number;
  popularPages: Record<string, number>;
  statusCodes: Record<string, number>;
  userAgents: Record<string, number>;
  ipAddresses: number;
}

interface TrafficData {
  sources: {
    direct: number;
    search: number;
    referral: number;
    social: number;
    socialPlatforms?: {
      wechat: number;
      douyin: number;
      bilibili: number;
      xiaohongshu: number;
      youtube: number;
      other: number;
    };
  };
  devices: {
    desktop: number;
    mobile: number;
    tablet: number;
    bot: number;
    other: number;
  };
  hourly: Array<{
    hour: string;
    count: number;
  }>;
  behavior: {
    hourlyDistribution: number[];
    avgPageStayTime: Record<string, number>;
    userPaths: Array<{
      path: string;
      timestamp: string;
    }[]>;
  };
}

interface MetricCardProps {
  title: string;
  value: string | number;
  change?: string;
  icon: React.ReactNode;
}

const MetricCard: React.FC<MetricCardProps> = ({ title, value, change, icon }) => (
  <div className="bg-white rounded-xl p-6 shadow-sm">
    <div className="flex items-center justify-between">
      <div className="text-gray-600">{title}</div>
      <div className="p-2 bg-blue-50 rounded-lg">{icon}</div>
    </div>
    <div className="mt-4">
      <div className="text-2xl font-bold">{value}</div>
      {change && (
        <div className="flex items-center mt-2 text-sm">
          <ArrowUpRight className="w-4 h-4 text-green-500 mr-1" />
          <span className="text-green-500 font-medium">{change}</span>
          <span className="text-gray-500 ml-1">vs 上周</span>
        </div>
      )}
    </div>
  </div>
);

function App() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [trafficData, setTrafficData] = useState<TrafficData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState('7');
  const [expandedSources, setExpandedSources] = useState<boolean[]>(new Array(4).fill(false));

  // 获取指标数据
  const fetchMetrics = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/metrics`);
      if (!response.ok) throw new Error('获取指标数据失败');
      const data = await response.json();
      setMetrics(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取数据失败');
      console.error('获取指标数据错误:', err);
    }
  };

  // 获取流量数据
  const fetchTraffic = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/traffic`);
      if (!response.ok) throw new Error('获取流量数据失败');
      const data = await response.json();
      setTrafficData(data);
      console.log('Traffic data:', data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取数据失败');
      console.error('获取流量数据错误:', err);
    }
  };

  // 初始化数据加载
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchMetrics(), fetchTraffic()]);
      setLoading(false);
    };

    loadData();
    // 设置定时刷新（每5分钟）
    const interval = setInterval(loadData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white p-6 rounded-lg shadow-sm">
          <h2 className="text-xl font-semibold text-red-600 mb-2">出错了</h2>
          <p className="text-gray-600">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-gray-900">简历平台数据分析</h1>
          <div className="flex space-x-4">
            <select
              className="bg-white border border-gray-300 rounded-lg px-4 py-2"
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
            >
              <option value="7">最近 7 天</option>
              <option value="30">最近 30 天</option>
              <option value="90">最近 90 天</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <MetricCard
            title="总访问量"
            value={metrics?.totalVisits.toLocaleString() ?? '0'}
            icon={<Users className="w-6 h-6 text-blue-500" />}
          />
          <MetricCard
            title="24小时访问量"
            value={metrics?.last24Hours.toLocaleString() ?? '0'}
            icon={<Clock className="w-6 h-6 text-blue-500" />}
          />
          <MetricCard
            title="独立IP数"
            value={metrics?.ipAddresses.toLocaleString() ?? '0'}
            icon={<Activity className="w-6 h-6 text-blue-500" />}
          />
          <MetricCard
            title="成功率"
            value={`${(((metrics?.statusCodes['200'] ?? 0) / (metrics?.totalVisits ?? 1)) * 100).toFixed(1)}%`}
            icon={<LucideBarChart className="w-6 h-6 text-blue-500" />}
          />
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm mb-8">
          <h2 className="text-lg font-semibold mb-4">访问趋势</h2>
          <div className="h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trafficData?.hourly || []}>
                <defs>
                  <linearGradient id="colorVisits" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="hour"
                  tickFormatter={(value) => format(new Date(value), 'MM-dd HH:00')}
                />
                <YAxis />
                <Tooltip
                  labelFormatter={(value) => format(new Date(value), 'yyyy-MM-dd HH:00')}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="#3B82F6"
                  fillOpacity={1}
                  fill="url(#colorVisits)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* 流量来源分布 */}
          <div className="bg-white p-6 rounded-xl shadow-sm">
            <h2 className="text-lg font-semibold mb-4">流量来源分布</h2>
            <div className="space-y-4">
              {[
                { name: '直接访问', value: trafficData?.sources?.direct || 0, color: '#3B82F6' },
                { name: '搜索引擎', value: trafficData?.sources?.search || 0, color: '#60A5FA', 
                  subItems: trafficData?.sources?.searchEngines && [
                    { name: '谷歌', value: trafficData.sources.searchEngines.google || 0 },
                    { name: '必应', value: trafficData.sources.searchEngines.bing || 0 },
                    { name: '百度', value: trafficData.sources.searchEngines.baidu || 0 },
                    { name: '搜狗', value: trafficData.sources.searchEngines.sogou || 0 },
                    { name: '360搜索', value: trafficData.sources.searchEngines.so || 0 }
                  ]
                },
                { name: '外部引荐', value: trafficData?.sources?.referral || 0, color: '#93C5FD' },
                { name: '社交媒体', value: trafficData?.sources?.social || 0, color: '#BFDBFE',
                  subItems: trafficData?.sources?.socialPlatforms && [
                    { name: '微信公众号', value: trafficData.sources.socialPlatforms.wechat || 0 },
                    { name: '抖音', value: trafficData.sources.socialPlatforms.douyin || 0 },
                    { name: 'B站', value: trafficData.sources.socialPlatforms.bilibili || 0 },
                    { name: '小红书', value: trafficData.sources.socialPlatforms.xiaohongshu || 0 },
                    { name: 'YouTube', value: trafficData.sources.socialPlatforms.youtube || 0 },
                    { name: '其他', value: trafficData.sources.socialPlatforms.other || 0 }
                  ] }
              ].map((source, index) => {
                const values = Object.values(trafficData?.sources || {}).filter(val => typeof val === 'number');
                const total = values.length > 0 ? values.reduce((sum, val) => sum + (val || 0), 0) : 1;
                const percentage = total === 0 ? '0.0' : ((source.value / total) * 100).toFixed(1);
                
                return (
                  <div key={index} className="space-y-2">
                    <div 
                      className={`p-4 rounded-lg ${source.subItems ? 'cursor-pointer hover:bg-gray-50' : ''}`}
                      onClick={() => source.subItems && setExpandedSources(prev => {
                        const newState = [...prev];
                        newState[index] = !newState[index];
                        return newState;
                      })}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: source.color }} />
                          <span className="font-medium">{source.name}</span>
                        </div>
                        <div className="flex items-center space-x-4">
                          <span className="text-gray-600">{source.value.toLocaleString()} 访问</span>
                          <span className="text-gray-500">{percentage}%</span>
                          {source.subItems && (
                            <svg
                              className={`w-5 h-5 transform transition-transform ${expandedSources[index] ? 'rotate-180' : ''}`}
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    {expandedSources[index] && source.subItems && (
                      <div className="ml-6 space-y-2 border-l-2 border-gray-100 pl-4">
                        {source.subItems.map((subItem, subIndex) => {
                          const subPercentage = ((subItem.value / source.value) * 100).toFixed(1);
                          return (
                            <div key={subIndex} className="p-3 rounded-lg">
                              <div className="flex items-center justify-between">
                                <span className="text-gray-600">{subItem.name}</span>
                                <div className="flex items-center space-x-4">
                                  <span className="text-gray-600">{subItem.value.toLocaleString()} 访问</span>
                                  <span className="text-gray-500">{subPercentage}%</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 设备类型分布 */}
          <div className="bg-white p-6 rounded-xl shadow-sm">
            <h2 className="text-lg font-semibold mb-4">设备类型分布</h2>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[
                      { name: '桌面端', value: metrics?.devices?.desktop || 0 },
                      { name: '移动端', value: metrics?.devices?.mobile || 0 },
                      { name: '平板', value: metrics?.devices?.tablet || 0 },
                      { name: '爬虫', value: metrics?.devices?.bot || 0 },
                      { name: '其他', value: metrics?.devices?.other || 0 }
                    ]}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {[
                      { fill: '#3B82F6' },
                      { fill: '#60A5FA' },
                      { fill: '#93C5FD' },
                      { fill: '#BFDBFE' },
                      { fill: '#DBEAFE' }
                    ].map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* 热门页面统计 */}
        <div className="bg-white p-6 rounded-xl shadow-sm mb-8">
          <h2 className="text-lg font-semibold mb-4">热门页面统计</h2>
          <div className="space-y-4">
            {Object.entries(metrics?.popularPages || {})
              .sort(([, a], [, b]) => b - a)
              .slice(0, 10)
              .map(([path, count], index) => {
                const total = metrics?.totalVisits || 1;
                const percentage = ((count / total) * 100).toFixed(1);
                return (
                  <div key={index} className="p-4 rounded-lg hover:bg-gray-50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="w-3 h-3 rounded-full bg-blue-500" />
                        <span className="font-medium truncate max-w-md" title={path}>{path}</span>
                      </div>
                      <div className="flex items-center space-x-4">
                        <span className="text-gray-600">{count.toLocaleString()} 访问</span>
                        <span className="text-gray-500">{percentage}%</span>
                      </div>
                    </div>
                    <div className="mt-2 w-full bg-gray-100 rounded-full h-2">
                      <div
                        className="bg-blue-500 h-2 rounded-full"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;