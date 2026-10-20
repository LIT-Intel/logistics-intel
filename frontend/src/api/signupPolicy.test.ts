import { expect, it, vi } from 'vitest';
import { validateWorkEmail } from './signupPolicy';
it('uses the server decision including verified exceptions and fails closed on errors', async () => {
  const rpc=vi.fn().mockResolvedValueOnce({ data:false,error:null }).mockResolvedValueOnce({ data:true,error:null }).mockResolvedValueOnce({ data:null,error:new Error('offline') });
  await expect(validateWorkEmail('new@gmail.com',{rpc})).rejects.toThrow('company email');
  await expect(validateWorkEmail(' sales@verified-company.com ',{rpc})).resolves.toBeUndefined();
  expect(rpc).toHaveBeenLastCalledWith('lit_signup_email_allowed',{p_email:'sales@verified-company.com'});
  await expect(validateWorkEmail('new@company.com',{rpc})).rejects.toThrow('try again');
});
