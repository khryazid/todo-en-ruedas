/**
 * @file store/slices/tenantSlice.ts
 * @description Gestión de organizaciones / multi-tenancy.
 */

import { supabase } from '../../supabase/client';
import type { SetState, GetState } from '../types';
import type { Organization, OrganizationMember } from '../../types';
import toast from 'react-hot-toast';

export interface TenantSlice {
  currentOrganization: Organization | null;
  userOrganizations: Organization[];
  currentOrgMember: OrganizationMember | null;

  setCurrentOrganization: (org: Organization) => void;
  fetchUserOrganizations: () => Promise<Organization[]>;
  createOrganization: (data: {
    name: string;
    slug: string;
    rif?: string;
    currency?: string;
  }) => Promise<Organization | null>;
  switchOrganization: (orgId: string) => Promise<void>;
}

export const createTenantSlice = (set: SetState, get: GetState): TenantSlice => ({
  currentOrganization: null,
  userOrganizations: [],
  currentOrgMember: null,

  setCurrentOrganization: (org: Organization) => {
    localStorage.setItem('active_org_id', org.id);
    set({ currentOrganization: org });
  },

  fetchUserOrganizations: async () => {
    const user = get().user;
    if (!user) return [];

    try {
      const { data, error } = await supabase
        .from('organization_members')
        .select(`
          id,
          organization_id,
          user_id,
          role,
          is_active,
          created_at,
          organizations:organization_id (
            id,
            name,
            slug,
            rif,
            phone,
            email,
            address,
            logo_url,
            is_active,
            created_at
          )
        `)
        .eq('user_id', user.id)
        .eq('is_active', true);

      if (error) {
        console.error('Error al consultar organizaciones del usuario:', error);
        return [];
      }

      const orgs: Organization[] = [];
      let activeMember: OrganizationMember | null = null;

      type OrgRow = {
        id: string;
        organization_id: string;
        user_id: string;
        role: OrganizationMember['role'];
        is_active: boolean;
        created_at: string;
        organizations: {
          id: string;
          name: string;
          slug: string;
          rif?: string;
          phone?: string;
          email?: string;
          address?: string;
          logo_url?: string;
          is_active: boolean;
          created_at: string;
        } | null;
      };

      ((data || []) as unknown as OrgRow[]).forEach((row) => {
        if (row.organizations) {
          const org: Organization = {
            id: row.organizations.id,
            name: row.organizations.name,
            slug: row.organizations.slug,
            rif: row.organizations.rif,
            phone: row.organizations.phone,
            email: row.organizations.email,
            address: row.organizations.address,
            logoUrl: row.organizations.logo_url,
            isActive: row.organizations.is_active,
            createdAt: row.organizations.created_at,
          };
          orgs.push(org);

          if (get().currentOrganization?.id === org.id) {
            activeMember = {
              id: row.id,
              organizationId: row.organization_id,
              userId: row.user_id,
              role: row.role,
              isActive: row.is_active,
              createdAt: row.created_at,
              organization: org,
            };
          }
        }
      });

      // Si no hay organización activa seleccionada o la guardada no existe, seleccionar la primera
      const savedOrgId = localStorage.getItem('active_org_id');
      const targetOrg = orgs.find((o) => o.id === savedOrgId) || orgs[0] || null;

      const firstRow = (data?.[0] as unknown as OrgRow) || null;
      set({
        userOrganizations: orgs,
        currentOrganization: targetOrg,
        currentOrgMember:
          activeMember ||
          (targetOrg && firstRow
            ? {
                id: firstRow.id,
                organizationId: firstRow.organization_id,
                userId: firstRow.user_id,
                role: firstRow.role,
                isActive: firstRow.is_active,
                createdAt: firstRow.created_at,
                organization: targetOrg,
              }
            : null),
      });

      return orgs;
    } catch (err) {
      console.error('Error inesperado al cargar organizaciones:', err);
      return [];
    }
  },

  createOrganization: async (data) => {
    try {
      const { data: orgId, error } = await supabase.rpc('create_organization', {
        p_name: data.name,
        p_slug: data.slug,
        p_rif: data.rif || null,
        p_currency: data.currency || 'USD',
      });

      if (error) {
        console.error('Error al crear organización:', error);
        toast.error(`Error al crear negocio: ${error.message}`);
        return null;
      }

      toast.success(`¡Negocio "${data.name}" creado con éxito! 🏢`);

      // Refrescar lista de organizaciones y cambiar a la recién creada
      const orgs = await get().fetchUserOrganizations();
      const newOrg = orgs.find((o) => o.id === orgId);
      if (newOrg) {
        await get().switchOrganization(newOrg.id);
      }
      return newOrg || null;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'No se pudo crear la organización';
      toast.error(`Error: ${msg}`);
      return null;
    }
  },

  switchOrganization: async (orgId: string) => {
    const targetOrg = get().userOrganizations.find((o) => o.id === orgId);
    if (!targetOrg) {
      toast.error('Organización no encontrada.');
      return;
    }

    localStorage.setItem('active_org_id', orgId);
    set({ currentOrganization: targetOrg });
    toast.success(`Cambiando a "${targetOrg.name}"...`);

    // Recargar datos iniciales filtrados por la nueva organización
    await get().fetchInitialData();
  },
});
