'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Key, Loader2, AlertCircle, Shield, Eye, EyeOff, Mail, CheckCircle2, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { apiClient } from '@/lib/api-client';
import { setStoredApiKey } from '@/lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Forgot key state
  const [showForgotKey, setShowForgotKey] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSuccess, setForgotSuccess] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      // Validate API key format
      if (!apiKey.startsWith('znt_')) {
        throw new Error('Invalid API key format. Key should start with "znt_"');
      }

      // Test the API key by making a health check request
      apiClient.setApiKey(apiKey);

      try {
        await apiClient.getHealth();
      } catch (err) {
        // If we get a 401, the key is invalid
        const message = err instanceof Error ? err.message : 'Unknown error';
        if (message.includes('401') || message.includes('UNAUTHORIZED') || message.includes('Invalid')) {
          throw new Error('Invalid API key. Please check your key and try again.');
        }
        // For other errors (network, etc.), the key might still be valid
        // but we should warn the user
        console.warn('Health check failed, but proceeding:', message);
      }

      // Store the API key and set auth cookie
      setStoredApiKey(apiKey);

      // Redirect to dashboard
      router.push('/');
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to validate API key';
      setError(message);
      apiClient.clearApiKey();
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError(null);
    setForgotLoading(true);

    try {
      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(forgotEmail)) {
        throw new Error('Please enter a valid email address');
      }

      await apiClient.forgotApiKey(forgotEmail);
      setForgotSuccess(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to request new API key';
      setForgotError(message);
    } finally {
      setForgotLoading(false);
    }
  };

  const resetForgotState = () => {
    setShowForgotKey(false);
    setForgotEmail('');
    setForgotSuccess(false);
    setForgotError(null);
  };

  // Forgot Key View
  if (showForgotKey) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-light-bg dark:bg-dark-bg p-4">
        <div className="w-full max-w-md space-y-6">
          {/* Logo/Brand */}
          <div className="text-center space-y-2">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-zentoria-500 to-zentoria-600 flex items-center justify-center shadow-lg">
              <Shield className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold">Zentoria PE</h1>
            <p className="text-muted-foreground">AI Control Plane</p>
          </div>

          {/* Forgot Key Card */}
          <Card className="border-border/50">
            <CardHeader className="space-y-1 pb-4">
              <CardTitle className="text-xl text-center">
                {forgotSuccess ? 'Check Your Email' : 'Forgot API Key'}
              </CardTitle>
              <p className="text-sm text-muted-foreground text-center">
                {forgotSuccess
                  ? 'We\'ve sent a new API key to your email'
                  : 'Enter your email to receive a new API key'}
              </p>
            </CardHeader>
            <CardContent>
              {forgotSuccess ? (
                <div className="space-y-4">
                  {/* Success Message */}
                  <div className="flex flex-col items-center gap-4 py-4">
                    <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
                      <CheckCircle2 className="h-8 w-8 text-green-500" />
                    </div>
                    <p className="text-sm text-center text-muted-foreground">
                      If an account exists with <strong>{forgotEmail}</strong>, you will receive an email with your new API key.
                    </p>
                    <p className="text-xs text-center text-muted-foreground">
                      The key will expire in 90 days. Check your spam folder if you don&apos;t see the email.
                    </p>
                  </div>

                  {/* Back to Login */}
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={resetForgotState}
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to Login
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleForgotSubmit} className="space-y-4">
                  {/* Error Message */}
                  {forgotError && (
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400">
                      <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                      <p className="text-sm">{forgotError}</p>
                    </div>
                  )}

                  {/* Email Input */}
                  <div className="space-y-2">
                    <Label htmlFor="forgotEmail" className="text-sm font-medium">
                      Email Address
                    </Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="forgotEmail"
                        type="email"
                        placeholder="you@example.com"
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        className="pl-10"
                        disabled={forgotLoading}
                        autoComplete="email"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Enter the email associated with your API key
                    </p>
                  </div>

                  {/* Submit Button */}
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={forgotLoading || !forgotEmail.trim()}
                  >
                    {forgotLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Mail className="mr-2 h-4 w-4" />
                        Send New API Key
                      </>
                    )}
                  </Button>

                  {/* Back to Login */}
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full"
                    onClick={resetForgotState}
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to Login
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Login View
  return (
    <div className="min-h-screen flex items-center justify-center bg-light-bg dark:bg-dark-bg p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Logo/Brand */}
        <div className="text-center space-y-2">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-zentoria-500 to-zentoria-600 flex items-center justify-center shadow-lg">
            <Shield className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold">Zentoria PE</h1>
          <p className="text-muted-foreground">AI Control Plane</p>
        </div>

        {/* Login Card */}
        <Card className="border-border/50">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-xl text-center">Sign In</CardTitle>
            <p className="text-sm text-muted-foreground text-center">
              Enter your API key to access the dashboard
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Error Message */}
              {error && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400">
                  <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                  <p className="text-sm">{error}</p>
                </div>
              )}

              {/* API Key Input */}
              <div className="space-y-2">
                <Label htmlFor="apiKey" className="text-sm font-medium">
                  API Key
                </Label>
                <div className="relative">
                  <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="apiKey"
                    type={showKey ? 'text' : 'password'}
                    placeholder="znt_test_sk_..."
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="pl-10 pr-10"
                    disabled={isLoading}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    tabIndex={-1}
                  >
                    {showKey ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Your API key starts with <code className="bg-muted px-1 py-0.5 rounded">znt_</code>
                </p>
              </div>

              {/* Submit Button */}
              <Button
                type="submit"
                className="w-full"
                disabled={isLoading || !apiKey.trim()}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Validating...
                  </>
                ) : (
                  <>
                    <Key className="mr-2 h-4 w-4" />
                    Sign In
                  </>
                )}
              </Button>
            </form>

            {/* Forgot API Key Link */}
            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => setShowForgotKey(true)}
                className="text-sm text-zentoria-500 hover:text-zentoria-600 hover:underline transition-colors"
              >
                Forgot API Key?
              </button>
            </div>
          </CardContent>
        </Card>

        {/* Help Text */}
        <p className="text-center text-sm text-muted-foreground">
          Need an API key?{' '}
          <a
            href="https://docs.zentoria.ai/api-keys"
            target="_blank"
            rel="noopener noreferrer"
            className="text-zentoria-500 hover:underline"
          >
            Learn more
          </a>
        </p>
      </div>
    </div>
  );
}
