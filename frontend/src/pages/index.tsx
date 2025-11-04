// frontend/src/pages/index.tsx
import type { GetServerSideProps } from 'next';

export const getServerSideProps: GetServerSideProps = async () => {
  return {
    redirect: { destination: '/search', permanent: false },
  };
};

export default function Index() {
  return null;
}
