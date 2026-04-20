import { Navigate } from 'react-router-dom';

export default function ContaPagarForm() {
  return <Navigate to="/contas-a-pagar?modal=new" replace />;
}
