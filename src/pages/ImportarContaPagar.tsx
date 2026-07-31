import { Navigate, useLocation } from 'react-router-dom';

export default function ImportarContaPagar() {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  searchParams.set('tab', 'saidas');
  searchParams.set('modal', 'import');

  return (
    <Navigate
      to={{
        pathname: '/financeiro',
        search: `?${searchParams.toString()}`,
        hash: location.hash,
      }}
      replace
    />
  );
}
