import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCartContext } from '../contexts/CartContext';

export default function Cart() {
  const navigate = useNavigate();
  const { setIsDrawerOpen } = useCartContext();

  useEffect(() => {
    setIsDrawerOpen(true);
    navigate('/shop', { replace: true });
  }, [navigate, setIsDrawerOpen]);

  return null;
}
