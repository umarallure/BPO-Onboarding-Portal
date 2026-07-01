import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { hasOnboardingPortalAccess } from '@/lib/portalAccess';
import { supabase } from '@/integrations/supabase/client';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdminOrSuperAdmin?: boolean;
}

type RoleCheckRow = {
  role?: string | null;
  is_super_admin?: boolean | null;
};

type RoleCheckClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<{ data: RoleCheckRow | null; error: { message?: string } | null }>;
      };
    };
  };
};

const ProtectedRoute = ({ children, requireAdminOrSuperAdmin = false }: ProtectedRouteProps) => {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [accessCheckLoading, setAccessCheckLoading] = useState(false);
  const [routeAllowed, setRouteAllowed] = useState(false);

  useEffect(() => {
    const checkUserAccess = async () => {
      if (loading) return;
      if (!user) {
        setRouteAllowed(false);
        return;
      }

      setAccessCheckLoading(true);

      let hasAccess = false;
      try {
        hasAccess = await hasOnboardingPortalAccess(user.id);
      } catch {
        hasAccess = false;
      }

      if (hasAccess) {
        if (requireAdminOrSuperAdmin) {
          const client = supabase as unknown as RoleCheckClient;
          const { data, error } = await client
            .from('app_users')
            .select('role,is_super_admin')
            .eq('user_id', user.id)
            .maybeSingle();

          const allowed = !error && (
            Boolean(data?.is_super_admin) ||
            data?.role === 'super_admin' ||
            data?.role === 'admin'
          );

          if (!allowed) {
            setRouteAllowed(false);
            setAccessCheckLoading(false);
            navigate('/manager-dashboard', { replace: true });
            return;
          }
        }

        setRouteAllowed(true);
        setAccessCheckLoading(false);
        return;
      }

      setRouteAllowed(false);
      setAccessCheckLoading(false);
      await signOut();
      navigate('/auth', { replace: true, state: { from: location.pathname } });
    };

    checkUserAccess();
  }, [user, loading, navigate, location.pathname, signOut, requireAdminOrSuperAdmin]);

  if (loading || accessCheckLoading || !routeAllowed) {
    // Avoid full-screen loaders so the app shell remains visible.
    // Page-level loading states still handle data fetching UX.
    return null;
  }

  if (!user) {
    return null;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
