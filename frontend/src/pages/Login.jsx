import { SignIn } from "@clerk/clerk-react";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950">
      <SignIn
        routing="path"
        path="/login"
        signUpUrl="/signup"
        redirectUrl="/app/dashboard"
      />
    </div>
  );
}
