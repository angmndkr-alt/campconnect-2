import { useState } from 'react';
import { useLocation, Link } from 'wouter';
import { Sparkles, CheckCircle2, LockKeyhole, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Brand } from '@/components/brand';
import { SiteHeader } from '@/components/site-header';
import { useAuth } from '@/lib/auth';

export default function ResetPasswordPage() {
  const [, setLocation] = useLocation();
  const { changePassword } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    const res = await changePassword(newPassword);
    if (res.error) {
      setError(res.error);
    } else {
      setSuccess(true);
      setTimeout(() => setLocation('/login'), 2000);
    }
  };

  return (
    <><SiteHeader/><main className="grid min-h-[calc(100dvh-76px)] place-items-center bg-background p-4">
      <div className="w-full max-w-md panel">
        <div className="mb-6 flex justify-center"><Brand/></div>

        {success ? (
          <div className="text-center py-6">
            <CheckCircle2 className="mx-auto size-12 text-emerald-500" />
            <h2 className="mt-4 font-display text-2xl font-bold">Password Reset Complete</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Your password has been updated. Redirecting to login…
            </p>
          </div>
        ) : (
          <>
            <p className="eyebrow text-xs font-bold uppercase tracking-widest text-primary text-center">Account Security</p>
            <h1 className="font-display text-3xl font-bold text-center mt-1">Set New Password</h1>
            <p className="mt-2 text-xs text-muted-foreground text-center">
              Please enter your new password below.
            </p>

            {error && (
              <p role="alert" className="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </p>
            )}

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <label className="block text-sm font-semibold">
                New Password
                <Input
                  type="password"
                  required
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="mt-1 h-12 rounded-xl bg-card"
                />
              </label>

              <label className="block text-sm font-semibold">
                Confirm New Password
                <Input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Repeat new password"
                  className="mt-1 h-12 rounded-xl bg-card"
                />
              </label>

              <Button type="submit" className="h-12 w-full rounded-xl text-base font-bold">
                Update Password <ArrowRight className="ml-2 size-4" />
              </Button>
            </form>
          </>
        )}
      </div>
    </main></>
  );
}
