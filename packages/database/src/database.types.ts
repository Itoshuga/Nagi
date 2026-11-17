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
          has_neighborhoods: boolean;
          created_at: string;
          updated_at: string;
          description: string | null;
          cover_image_url: string | null;
          is_published: boolean;
          sort_order: number;
          latitude: number | null;
          longitude: number | null;
        };
        Insert: {
          id?: string;
          country_id: string;
          name: string;
          slug: string;
          has_neighborhoods?: boolean;
          created_at?: string;
          updated_at?: string;
          description?: string | null;
          cover_image_url?: string | null;
          is_published?: boolean;
          sort_order?: number;
          latitude?: number | null;
          longitude?: number | null;
        };
        Update: {
          id?: string;
          country_id?: string;
          name?: string;
          slug?: string;
          has_neighborhoods?: boolean;
          created_at?: string;
          updated_at?: string;
          description?: string | null;
          cover_image_url?: string | null;
          is_published?: boolean;
          sort_order?: number;
          latitude?: number | null;
          longitude?: number | null;
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
          iso_code: string | null;
          created_at: string;
          updated_at: string;
          description: string | null;
          cover_image_url: string | null;
          is_published: boolean;
          sort_order: number;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          iso_code?: string | null;
          created_at?: string;
          updated_at?: string;
          description?: string | null;
          cover_image_url?: string | null;
          is_published?: boolean;
          sort_order?: number;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          iso_code?: string | null;
          created_at?: string;
          updated_at?: string;
          description?: string | null;
          cover_image_url?: string | null;
          is_published?: boolean;
          sort_order?: number;
        };
        Relationships: [
        ];
      };
      discord_guilds: {
        Row: {
          id: string;
          application_id: string;
          name: string;
          icon_hash: string | null;
          icon_url: string | null;
          bot_present: boolean;
          last_synced_at: string;
          members_can_create_trips: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          application_id: string;
          name: string;
          icon_hash?: string | null;
          icon_url?: string | null;
          bot_present?: boolean;
          last_synced_at?: string;
          members_can_create_trips?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          application_id?: string;
          name?: string;
          icon_hash?: string | null;
          icon_url?: string | null;
          bot_present?: boolean;
          last_synced_at?: string;
          members_can_create_trips?: boolean;
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
          description: string | null;
          cover_image_url: string | null;
          is_published: boolean;
          sort_order: number;
          latitude: number | null;
          longitude: number | null;
        };
        Insert: {
          id?: string;
          city_id: string;
          name: string;
          slug: string;
          created_at?: string;
          updated_at?: string;
          description?: string | null;
          cover_image_url?: string | null;
          is_published?: boolean;
          sort_order?: number;
          latitude?: number | null;
          longitude?: number | null;
        };
        Update: {
          id?: string;
          city_id?: string;
          name?: string;
          slug?: string;
          created_at?: string;
          updated_at?: string;
          description?: string | null;
          cover_image_url?: string | null;
          is_published?: boolean;
          sort_order?: number;
          latitude?: number | null;
          longitude?: number | null;
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
          global_name: string | null;
          avatar_hash: string | null;
          banner_hash: string | null;
          banner_url: string | null;
          accent_color: number | null;
          discord_synced_at: string | null;
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
          global_name?: string | null;
          avatar_hash?: string | null;
          banner_hash?: string | null;
          banner_url?: string | null;
          accent_color?: number | null;
          discord_synced_at?: string | null;
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
          global_name?: string | null;
          avatar_hash?: string | null;
          banner_hash?: string | null;
          banner_url?: string | null;
          accent_color?: number | null;
          discord_synced_at?: string | null;
        };
        Relationships: [
        ];
      };
      trip_days: {
        Row: {
          id: string;
          trip_id: string;
          day_number: number;
          date: string | null;
          title: string;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          trip_id: string;
          day_number: number;
          date?: string | null;
          title?: string;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          trip_id?: string;
          day_number?: number;
          date?: string | null;
          title?: string;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: 'trip_days_trip_id_fkey'; columns: ["trip_id"]; isOneToOne: false; referencedRelation: 'trips'; referencedColumns: ["id"]; },
        ];
      };
      trip_items: {
        Row: {
          id: string;
          trip_id: string;
          trip_day_id: string | null;
          entry_id: string;
          added_by: string | null;
          notes: string;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          trip_id: string;
          trip_day_id?: string | null;
          entry_id: string;
          added_by?: string | null;
          notes?: string;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          trip_id?: string;
          trip_day_id?: string | null;
          entry_id?: string;
          added_by?: string | null;
          notes?: string;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: 'trip_items_added_by_fkey'; columns: ["added_by"]; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ["id"]; },
          { foreignKeyName: 'trip_items_entry_id_fkey'; columns: ["entry_id"]; isOneToOne: false; referencedRelation: 'entries'; referencedColumns: ["id"]; },
          { foreignKeyName: 'trip_items_trip_day_id_trip_id_fkey'; columns: ["trip_day_id","trip_id"]; isOneToOne: false; referencedRelation: 'trip_days'; referencedColumns: ["id","trip_id"]; },
          { foreignKeyName: 'trip_items_trip_id_fkey'; columns: ["trip_id"]; isOneToOne: false; referencedRelation: 'trips'; referencedColumns: ["id"]; },
        ];
      };
      trips: {
        Row: {
          id: string;
          guild_id: string;
          title: string;
          description: string;
          cover_image_url: string | null;
          start_date: string | null;
          end_date: string | null;
          status: Database['public']['Enums']['trip_status'];
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          guild_id: string;
          title: string;
          description?: string;
          cover_image_url?: string | null;
          start_date?: string | null;
          end_date?: string | null;
          status?: Database['public']['Enums']['trip_status'];
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          guild_id?: string;
          title?: string;
          description?: string;
          cover_image_url?: string | null;
          start_date?: string | null;
          end_date?: string | null;
          status?: Database['public']['Enums']['trip_status'];
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: 'trips_created_by_fkey'; columns: ["created_by"]; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ["id"]; },
          { foreignKeyName: 'trips_guild_id_fkey'; columns: ["guild_id"]; isOneToOne: false; referencedRelation: 'discord_guilds'; referencedColumns: ["id"]; },
        ];
      };
      user_guild_preferences: {
        Row: {
          user_id: string;
          default_guild_id: string | null;
          last_active_guild_id: string | null;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          default_guild_id?: string | null;
          last_active_guild_id?: string | null;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          default_guild_id?: string | null;
          last_active_guild_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: 'user_guild_preferences_default_guild_id_fkey'; columns: ["default_guild_id"]; isOneToOne: false; referencedRelation: 'discord_guilds'; referencedColumns: ["id"]; },
          { foreignKeyName: 'user_guild_preferences_last_active_guild_id_fkey'; columns: ["last_active_guild_id"]; isOneToOne: false; referencedRelation: 'discord_guilds'; referencedColumns: ["id"]; },
          { foreignKeyName: 'user_guild_preferences_user_id_fkey'; columns: ["user_id"]; isOneToOne: true; referencedRelation: 'profiles'; referencedColumns: ["id"]; },
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      acquire_bot_lease: { Args: { p_application_id: string; p_scope: string; p_instance: string }; Returns: string; };
      can_create_guild_trip: { Args: { p_guild_id: string }; Returns: boolean; };
      can_edit_guild_trip: { Args: { p_trip_id: string }; Returns: boolean; };
      claim_bot_sync: { Args: { p_application_id: string; p_scope: string; p_token: string }; Returns: Database['public']['Tables']['bot_sync_requests']['Row'][]; };
      claim_discord_refresh: { Args: { p_user_id: string; p_version: number; p_lease: string }; Returns: boolean; };
      configure_owners: { Args: { p_ids: (string)[] }; Returns: undefined; };
      enqueue_bot_sync: { Args: { p_application_id: string; p_scope: string; p_reason: string }; Returns: string; };
      finish_bot_sync: { Args: { p_id: string; p_token: string; p_success: boolean; p_error: string; p_commands: Json }; Returns: undefined; };
      finish_discord_refresh: { Args: { p_user_id: string; p_lease: string; p_encrypted_tokens: string; p_expires_at: string; p_scopes: (string)[] }; Returns: boolean; };
      is_guild_admin: { Args: { p_guild_id: string }; Returns: boolean; };
      is_guild_member: { Args: { p_guild_id: string }; Returns: boolean; };
      is_nagi_admin: { Args: Record<PropertyKey, never>; Returns: boolean; };
      read_discord_credentials: { Args: { p_user_id: string }; Returns: Json; };
      read_discord_guild_snapshot: { Args: { p_user_id: string; p_application_id: string }; Returns: Json; };
      reconcile_discord_guilds: { Args: { p_application_id: string; p_guilds: Json }; Returns: undefined; };
      record_discord_memberships: { Args: { p_user_id: string; p_application_id: string; p_guilds: Json }; Returns: undefined; };
      release_bot_lease: { Args: { p_application_id: string; p_scope: string; p_token: string }; Returns: undefined; };
      release_discord_refresh: { Args: { p_user_id: string; p_lease: string }; Returns: undefined; };
      renew_bot_lease: { Args: { p_application_id: string; p_scope: string; p_token: string; p_connected: boolean }; Returns: boolean; };
      revoke_discord_credentials: { Args: { p_user_id: string; p_version: number }; Returns: undefined; };
      save_discord_credentials: { Args: { p_user_id: string; p_discord_id: string; p_profile: Json; p_encrypted_tokens: string; p_expires_at: string; p_scopes: (string)[] }; Returns: undefined; };
      set_discord_guild_presence: { Args: { p_application_id: string; p_guild: Json; p_present: boolean }; Returns: undefined; };
      sync_discord_profile: { Args: Record<PropertyKey, never>; Returns: Database['public']['Tables']['profiles']['Row']; };
      trip_author_card: { Args: { p_trip_id: string }; Returns: Json; };
    };
    Enums: {
      app_role: "user" | "admin" | "owner";
      trip_status: "planned" | "ongoing" | "completed" | "cancelled";
    };
    CompositeTypes: { [_ in never]: never };
  };
};
