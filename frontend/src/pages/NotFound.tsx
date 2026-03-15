import { useNavigate } from 'react-router-dom';
import Button from '@/components/ui/Button';

export default function NotFound() {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center justify-center h-full text-center">
      <div className="text-7xl font-black text-gradient mb-4">404</div>
      <h2 className="text-xl font-bold text-gray-200 mb-2">Page Not Found</h2>
      <p className="text-sm text-gray-500 mb-6">The page you're looking for doesn't exist.</p>
      <Button variant="accent" onClick={() => navigate('/')}>Go to Dashboard</Button>
    </div>
  );
}
