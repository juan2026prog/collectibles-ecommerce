import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

export default function Callback() {
  const [searchParams] = useSearchParams();
  const code = searchParams.get('code');

  useEffect(() => {
    if (code) {
      console.log("code:", code);
    }
  }, [code]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white p-4">
      <div className="max-w-md w-full bg-slate-800 rounded-2xl shadow-2xl p-8 border border-slate-700">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-3 h-3 rounded-full bg-red-500"></div>
          <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
          <div className="w-3 h-3 rounded-full bg-green-500"></div>
          <span className="ml-2 text-slate-400 font-mono text-sm italic">Auth Callback</span>
        </div>
        
        <h1 className="text-xl font-semibold mb-4 text-slate-100">Authorization Code</h1>
        
        <div className="bg-slate-950 rounded-xl p-4 border border-slate-700 font-mono text-sm relative group overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-blue-500 opacity-50"></div>
          <pre className="text-blue-400 break-all whitespace-pre-wrap">
            {code ? `code: ${code}` : '// No code found in URL parameters'}
          </pre>
        </div>

        <p className="mt-6 text-slate-400 text-xs text-center italic">
          This page captures and displays authentication codes for debugging and integration purposes.
        </p>
      </div>
    </div>
  );
}
