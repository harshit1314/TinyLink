'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface LinkData {
  id: number;
  shortCode: string;
  targetUrl: string;
  totalClicks: number;
  createdAt: string;
  lastClickedAt: string | null;
}

export default function StatsPage({ params }: { params: { code: string } }) {
  const [link, setLink] = useState<LinkData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchLink = async () => {
      try {
        const res = await fetch(`/api/links/${params.code}`);
        if (!res.ok) {
          if (res.status === 404) throw new Error('Link not found');
          throw new Error('Failed to fetch link details');
        }
        const data = await res.json();
        setLink(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchLink();
  }, [params.code]);

  if (loading) return <div className="p-8 text-center">Loading stats...</div>;
  if (error) return <div className="p-8 text-center text-red-500">Error: {error}</div>;
  if (!link) return <div className="p-8 text-center">Link not found</div>;

  return (
    <div className="min-h-screen bg-gray-50 p-8 font-sans">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <Link href="/" className="inline-flex items-center text-sm font-medium text-gray-500 hover:text-indigo-600 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 mr-1">
              <path fillRule="evenodd" d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z" clipRule="evenodd" />
            </svg>
            Back to Dashboard
          </Link>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="bg-gray-50/50 px-8 py-6 border-b border-gray-200 flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Link Statistics</h1>
              <p className="text-sm text-gray-500 mt-1">Performance metrics for your short link</p>
            </div>
            <div className="bg-white p-2 rounded-lg border border-gray-200 shadow-sm">
              <div className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-1 text-center">Short Code</div>
              <div className="text-xl font-mono font-bold text-indigo-600 text-center tracking-wider">{link.shortCode}</div>
            </div>
          </div>

          <div className="p-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <div className="p-6 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-100">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm font-medium text-blue-600 uppercase tracking-wide">Total Clicks</p>
                  <div className="p-2 bg-white rounded-lg shadow-sm text-blue-600">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                      <path d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
                      <path fillRule="evenodd" d="M.664 10.59a1.651 1.651 0 0 1 0-1.186A10.004 10.004 0 0 1 10 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0 1 10 17c-4.257 0-7.893-2.66-9.336-6.41ZM14 10a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" clipRule="evenodd" />
                    </svg>
                  </div>
                </div>
                <p className="text-4xl font-bold text-gray-900">{link.totalClicks}</p>
                <p className="text-sm text-gray-500 mt-2">All time visits</p>
              </div>
              
              <div className="p-6 bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl border border-green-100">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm font-medium text-green-600 uppercase tracking-wide">Status</p>
                  <div className="p-2 bg-white rounded-lg shadow-sm text-green-600">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                      <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
                    </svg>
                  </div>
                </div>
                <p className="text-4xl font-bold text-gray-900">Active</p>
                <p className="text-sm text-gray-500 mt-2">Redirecting normally</p>
              </div>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Target URL</label>
                <div className="flex items-center p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <img 
                    src={`https://www.google.com/s2/favicons?domain=${link.targetUrl}&sz=32`} 
                    alt="" 
                    className="w-5 h-5 mr-3 opacity-70"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                  <a 
                    href={link.targetUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-indigo-600 hover:underline break-all font-medium"
                  >
                    {link.targetUrl}
                  </a>
                  <a 
                    href={link.targetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-auto text-gray-400 hover:text-gray-600 p-1"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                      <path fillRule="evenodd" d="M4.25 5.5a.75.75 0 0 0-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 0 0 .75-.75v-4a.75.75 0 0 1 1.5 0v4A2.25 2.25 0 0 1 12.75 17h-8.5A2.25 2.25 0 0 1 2 14.75v-8.5A2.25 2.25 0 0 1 4.25 4h5a.75.75 0 0 1 0 1.5h-5Z" clipRule="evenodd" />
                      <path fillRule="evenodd" d="M6.194 12.753a.75.75 0 0 0 1.06.053L16.5 4.44v2.81a.75.75 0 0 0 1.5 0v-4.5a.75.75 0 0 0-.75-.75h-4.5a.75.75 0 0 0 0 1.5h2.553l-9.056 8.194a.75.75 0 0 0-.053 1.06Z" clipRule="evenodd" />
                    </svg>
                  </a>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Created At</label>
                  <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 text-gray-900">
                    {new Date(link.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Last Clicked</label>
                  <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 text-gray-900">
                    {link.lastClickedAt 
                      ? new Date(link.lastClickedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
                      : <span className="text-gray-400 italic">Never clicked</span>
                    }
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
