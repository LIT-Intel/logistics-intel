/** Server-owned policy includes verified domain exceptions. */
export async function validateWorkEmail(email: string, client: { rpc: (name: string, args: { p_email: string }) => PromiseLike<{ data: unknown; error: unknown }> }) {
  const { data, error } = await client.rpc('lit_signup_email_allowed', { p_email: email.trim() });
  if (error) throw new Error('We could not verify your email domain. Please try again.');
  if (data !== true) throw new Error('Please sign up with your company email address. Personal and disposable email accounts are not supported.');
}
