
import React, { useState, useCallback, useEffect } from 'react';
import { Company, User } from '@/api/entities';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle }
  from '@/components/ui/alert';
import { Lightbulb, ServerCrash, CheckCircle, Clock, Wifi } from 'lucide-react';
import { litPing } from '@/api/functions';

export default function Diagnostic() {
  const [user, setUser] = useState(null);
  const [userStatus, setUserStatus] = useState('loading');

  const [basicTestStatus, setBasicTestStatus] = useState('idle');
  const [basicTestResult, setBasicTestResult] = useState(null);
  const [basicErrorDetails, setBasicErrorDetails] = useState(null);

  const [companyDataTestStatus, setCompanyDataTestStatus] = useState('idle');
  const [companyDataTestResult, setCompanyDataTestResult] = useState(null);
  const [companyDataErrorDetails, setCompanyDataErrorDetails] = useState(null);

  const [litTestStatus, setLitTestStatus] = useState('idle');
  const [litTestResult, setLitTestResult] = useState(null);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const userData = await User.me();
        setUser(userData);
        setUserStatus('success');
      } catch (error) {
        console.error("Diagnostic: Failed to load user", error);
        setUserStatus('error');
      }
    };
    loadUser();
  }, []);

  const runLitPingTest = useCallback(async () => {
    setLitTestStatus('loading');
    setLitTestResult(null);
    try {
      const response = await litPing();
      console.log("LIT Ping Response:", response);
      setLitTestResult(response.data || response); // Handle potential nesting
      setLitTestStatus('success');
    } catch (error) {
      console.error("LIT Ping Test failed:", error);
      const errorData = error.response?.data || { error: error.message };
      setLitTestResult(errorData);
      setLitTestStatus('error');
    }
  }, []);

  const runBasicConnectionTest = useCallback(async () => {
    // ... implementation from previous turns
    setBasicTestStatus('loading');
    // ...
  }, []);

  const runCompanyDataTest = useCallback(async () => {
    // ... implementation from previous turns
    setCompanyDataTestStatus('loading');
    // ...
  }, []); // Changed from [user] to []

  const renderJson = (data) => {
    return (
      <pre className="mt-2 text-xs bg-gray-100 p-2 rounded overflow-auto whitespace-pre-wrap">
        {JSON.stringify(data, null, 2)}
      </pre>
    );
  };

  const renderLitGatewayError = (result) => {
    const errorMessage = result?.error || "";
    if (errorMessage.includes("bigquery.jobs.create permission")) {
      return (
        <div>
          <p className="font-semibold text-red-800">Root Cause Identified: Cloud IAM Permissions</p>
          <p className="mt-2">The LIT Gateway is responding, but it's being denied permission by Google Cloud. This is not an application code issue.</p>
          <div className="mt-3 bg-red-50 p-3 rounded-md border border-red-200">
            <p className="font-bold text-sm">Action Required:</p>
            <p className="text-sm">The service account for the Cloud Run service at <code className="text-xs bg-red-100 p-1 rounded">{result.env_check?.gateway_url}</code> needs the <code className="text-xs bg-red-100 p-1 rounded">BigQuery Job User</code> role in the <code className="text-xs bg-red-100 p-1 rounded">logistics-intel</code> Google Cloud project.</p>
          </div>
          <p className="mt-3 font-semibold">Raw Error:</p>
          {renderJson(result)}
        </div>
      );
    }
    // Default error rendering
    return (
      <div>
        The gateway returned an error. This is the most likely cause of the issues.
        {renderJson(result)}
      </div>
    );
  };
  
  return (
    <div className="p-4 md:p-6 lg:p-8 bg-gradient-to-br from-gray-50 to-blue-50/30 min-h-screen">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">System Diagnostic</h1>
          <p className="text-gray-600">Run tests to identify database and gateway connectivity issues.</p>
        </div>

        {/* New LIT Gateway Test */}
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-gray-200/60 mb-8">
          <h2 className="text-xl font-bold text-gray-900 mb-4">LIT Gateway Connection Test</h2>
          <p className="text-gray-600 mb-4">Tests the connection to the LIT Gateway to see if it can perform a basic query.</p>
          
          <Button
            onClick={runLitPingTest}
            disabled={litTestStatus === 'loading'}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-xl transition-colors mb-4"
          >
            {litTestStatus === 'loading' ? 'Pinging Gateway...' : 'Run LIT Gateway Test'}
          </Button>

          {litTestStatus === 'loading' && (
            <Alert className="bg-blue-50 border-blue-200">
              <Clock className="h-4 w-4" />
              <AlertTitle>Test in Progress...</AlertTitle>
              <AlertDescription>Pinging the LIT Gateway...</AlertDescription>
            </Alert>
          )}

          {litTestStatus === 'success' && litTestResult && (
            <Alert className="bg-green-50 border-green-200">
              <CheckCircle className="h-4 w-4 text-green-700" />
              <AlertTitle className="text-green-800">Gateway Connection Successful</AlertTitle>
              <AlertDescription>
                The gateway responded. Here is the output:
                {renderJson(litTestResult)}
              </AlertDescription>
            </Alert>
          )}

          {litTestStatus === 'error' && litTestResult && (
            <Alert variant="destructive">
              <ServerCrash className="h-4 w-4" />
              <AlertTitle>Gateway Test Failed</AlertTitle>
              <AlertDescription>
                {renderLitGatewayError(litTestResult)}
              </AlertDescription>
            </Alert>
          )}
        </div>

        {/* User Status */}
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-gray-200/60 mb-8">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Initial Check: User Status</h2>
          {userStatus === 'loading' && <p>Loading user...</p>}
          {userStatus === 'error' && (
            <p className="text-red-600 font-semibold flex items-center gap-2">
              <ServerCrash className="h-4 w-4" />
              Failed to load user!
            </p>
          )}
          {userStatus === 'success' && user && (
            <div className="text-green-700 font-semibold flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              <p>User loaded successfully: {user.email}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
