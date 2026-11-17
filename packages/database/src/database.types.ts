// Generated from PostgreSQL catalogs by pnpm db:types. Do not edit.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
export type Database = {
  public: {
    Tables: {
      bot_runtime: {
        Row: {
          application_id: string;
          scope: string;
          instance_id: string | null;
          lease_token: string | null;
          lease_until: string | null;
          connected: boolean;
          heartbeat_at: string | null;
          started_at: string | null;
          last_sync_at: string | null;
          command_count: number;
          commands: Json;
          sync_error: string | null;
          updated_at: string;
        };
        Insert: {
          application_id: string;
          scope: string;
          instance_id?: string | null;
          lease_token?: string | null;
          lease_until?: string | null;
          connected?: boolean;
          heartbeat_at?: string | null;
          started_at?: string | null;
          last_sync_at?: string | null;
          command_count?: number;
          commands?: Json;
          sync_error?: string | null;
          updated_at?: string;
        };
        Update: {
          application_id?: string;
          scope?: string;
          instance_id?: string | null;
          lease_token?: string | null;
          lease_until?: string | null;
          connected?: boolean;
          heartbeat_at?: string | null;
          started_at?: string | null;
          last_sync_at?: string | null;
          command_count?: number;
          commands?: Json;
          sync_error?: string | null;
          updated_at?: string;
        };
        Relationships: [
        ];
      };
      bot_sync_requests: {
        Row: {
          id: string;
          application_id: string;
          scope: string;
          reason: string;
          requested_by: string | null;
          status: string;
          attempts: number;
          lease_token: string | null;
          available_at: string;
          finished_at: string | null;
          error: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          application_id: string;
          scope: string;
          reason: string;
          requested_by?: string | null;
          status?: string;
          attempts?: number;
          lease_token?: string | null;
          available_at?: string;
          finished_at?: string | null;
          error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          application_id?: string;
          scope?: string;
          reason?: string;
          requested_by?: string | null;
          status?: string;
          attempts?: number;
          lease_token?: string | null;
          available_at?: string;
          finished_at?: string | null;
          error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: 'bot_sync_requests_requested_by_fkey'; columns: ["requested_by"]; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ["id"]; },
        ];
      };
      categories: {
        Row: {
          id: string;
          name: string;
          slug: string;
          position: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          position?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          position?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
        ];
      };
      cities: {
        Row: {
          id: string;
          country_id: string;
          name: string;
          slug: string;
          neighborhoods_enabled: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          country_id: string;
          name: string;
          slug: string;
          neighborhoods_enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          country_id?: string;
          name?: string;
          slug?: string;
          neighborhoods_enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: 'cities_country_id_fkey'; columns: ["country_id"]; isOneToOne: false; referencedRelation: 'countries'; referencedColumns: ["id"]; },
        ];
      };
      countries: {
        Row: {
          id: string;
          name: string;
          slug: string;
          code: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          code?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          code?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
        ];
      };
      entries: {
        Row: {
          id: string;
          city_id: string;
          neighborhood_id: string | null;
          category_id: string;
          title: string;
          slug: string;
          description: string;
          published: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          city_id: string;
          neighborhood_id?: string | null;
          category_id: string;
          title: string;
          slug: string;
          description?: string;
          published?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          city_id?: string;
          neighborhood_id?: string | null;
          category_id?: string;
          title?: string;
          slug?: string;
          description?: string;
          published?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: 'entries_category_id_fkey'; columns: ["category_id"]; isOneToOne: false; referencedRelation: 'categories'; referencedColumns: ["id"]; },
          { foreignKeyName: 'entries_city_id_fkey'; columns: ["city_id"]; isOneToOne: false; referencedRelation: 'cities'; referencedColumns: ["id"]; },
          { foreignKeyName: 'entries_created_by_fkey'; columns: ["created_by"]; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ["id"]; },
          { foreignKeyName: 'entries_neighborhood_id_city_id_fkey'; columns: ["neighborhood_id","city_id"]; isOneToOne: false; referencedRelation: 'neighborhoods'; referencedColumns: ["id","city_id"]; },
        ];
      };
      entry_relations: {
        Row: {
          id: string;
          source_id: string;
          target_id: string;
          kind: string;
          bidirectional: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          source_id: string;
          target_id: string;
          kind?: string;
          bidirectional?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          source_id?: string;
          target_id?: string;
          kind?: string;
          bidirectional?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: 'entry_relations_source_id_fkey'; columns: ["source_id"]; isOneToOne: false; referencedRelation: 'entries'; referencedColumns: ["id"]; },
          { foreignKeyName: 'entry_relations_target_id_fkey'; columns: ["target_id"]; isOneToOne: false; referencedRelation: 'entries'; referencedColumns: ["id"]; },
        ];
      };
      neighborhoods: {
        Row: {
          id: string;
          city_id: string;
          name: string;
          slug: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          city_id: string;
          name: string;
          slug: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          city_id?: string;
          name?: string;
          slug?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: 'neighborhoods_city_id_fkey'; columns: ["city_id"]; isOneToOne: false; referencedRelation: 'cities'; referencedColumns: ["id"]; },
        ];
      };
      profiles: {
        Row: {
          id: string;
          discord_id: string;
          username: string;
          display_name: string;
          avatar_url: string | null;
          role: Database['public']['Enums']['app_role'];
          last_login_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          discord_id: string;
          username: string;
          display_name: string;
          avatar_url?: string | null;
          role?: Database['public']['Enums']['app_role'];
          last_login_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          discord_id?: string;
          username?: string;
          display_name?: string;
          avatar_url?: string | null;
          role?: Database['public']['Enums']['app_role'];
          last_login_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      acquire_bot_lease: { Args: { p_application_id: string; p_scope: string; p_instance: string }; Returns: string; };
      claim_bot_sync: { Args: { p_application_id: string; p_scope: string; p_token: string }; Returns: Database['public']['Tables']['bot_sync_requests']['Row'][]; };
      configure_owners: { Args: { p_ids: (string)[] }; Returns: undefined; };
      enqueue_bot_sync: { Args: { p_application_id: string; p_scope: string; p_reason: string }; Returns: string; };
      finish_bot_sync: { Args: { p_id: string; p_token: string; p_success: boolean; p_error: string; p_commands: Json }; Returns: undefined; };
      is_nagi_admin: { Args: Record<PropertyKey, never>; Returns: boolean; };
      release_bot_lease: { Args: { p_application_id: string; p_scope: string; p_token: string }; Returns: undefined; };
      renew_bot_lease: { Args: { p_application_id: string; p_scope: string; p_token: string; p_connected: boolean }; Returns: boolean; };
      sync_discord_profile: { Args: Record<PropertyKey, never>; Returns: Database['public']['Tables']['profiles']['Row']; };
    };
    Enums: {
      app_role: "user" | "admin" | "owner";
    };
    CompositeTypes: { [_ in never]: never };
  };
};
