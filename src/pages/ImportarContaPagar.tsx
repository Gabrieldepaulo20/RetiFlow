import { Navigate } from 'react-router-dom';

export default function ImportarContaPagar() {
  return <Navigate to="/contas-a-pagar?modal=import" replace />;
}
