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
      catalog_media_garbage: {
        Row: {
          path: string;
          not_before: string;
        };
        Insert: {
          path: string;
          not_before?: string;
        };
        Update: {
          path?: string;
          not_before?: string;
        };
        Relationships: [
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
          description: string;
          icon: string;
          color: string;
          is_enabled: boolean;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          position?: number;
          created_at?: string;
          updated_at?: string;
          description?: string;
          icon?: string;
          color?: string;
          is_enabled?: boolean;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          position?: number;
          created_at?: string;
          updated_at?: string;
          description?: string;
          icon?: string;
          color?: string;
          is_enabled?: boolean;
        };
        Relationships: [
        ];
      };
      category_fields: {
        Row: {
          id: string;
          category_id: string;
          key: string;
          label: string;
          type: Database['public']['Enums']['catalog_field_type'];
          is_required: boolean;
          options: (string)[];
          sort_order: number;
          icon: string | null;
        };
        Insert: {
          id?: string;
          category_id: string;
          key: string;
          label: string;
          type: Database['public']['Enums']['catalog_field_type'];
          is_required?: boolean;
          options?: (string)[];
          sort_order?: number;
          icon?: string | null;
        };
        Update: {
          id?: string;
          category_id?: string;
          key?: string;
          label?: string;
          type?: Database['public']['Enums']['catalog_field_type'];
          is_required?: boolean;
          options?: (string)[];
          sort_order?: number;
          icon?: string | null;
        };
        Relationships: [
          { foreignKeyName: 'category_fields_category_id_fkey'; columns: ["category_id"]; isOneToOne: false; referencedRelation: 'categories'; referencedColumns: ["id"]; },
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
          country_id: string;
          summary: string;
          latitude: number | null;
          longitude: number | null;
          sort_order: number;
          custom_values: Json;
          cover_image_url: string | null;
          search_key: string | null;
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
          country_id: string;
          summary?: string;
          latitude?: number | null;
          longitude?: number | null;
          sort_order?: number;
          custom_values?: Json;
          cover_image_url?: string | null;
          search_key?: string | null;
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
          country_id?: string;
          summary?: string;
          latitude?: number | null;
          longitude?: number | null;
          sort_order?: number;
          custom_values?: Json;
          cover_image_url?: string | null;
          search_key?: string | null;
        };
        Relationships: [
          { foreignKeyName: 'entries_category_id_fkey'; columns: ["category_id"]; isOneToOne: false; referencedRelation: 'categories'; referencedColumns: ["id"]; },
          { foreignKeyName: 'entries_city_country_fkey'; columns: ["city_id","country_id"]; isOneToOne: false; referencedRelation: 'cities'; referencedColumns: ["id","country_id"]; },
          { foreignKeyName: 'entries_city_id_fkey'; columns: ["city_id"]; isOneToOne: false; referencedRelation: 'cities'; referencedColumns: ["id"]; },
          { foreignKeyName: 'entries_country_id_fkey'; columns: ["country_id"]; isOneToOne: false; referencedRelation: 'countries'; referencedColumns: ["id"]; },
          { foreignKeyName: 'entries_created_by_fkey'; columns: ["created_by"]; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ["id"]; },
          { foreignKeyName: 'entries_neighborhood_id_city_id_fkey'; columns: ["neighborhood_id","city_id"]; isOneToOne: false; referencedRelation: 'neighborhoods'; referencedColumns: ["id","city_id"]; },
        ];
      };
      entry_media: {
        Row: {
          id: string;
          entry_id: string;
          version: string;
          storage_path: string;
          alt_text: string;
          sort_order: number;
          is_cover: boolean;
          created_at: string;
        };
        Insert: {
          id: string;
          entry_id: string;
          version: string;
          storage_path: string;
          alt_text: string;
          sort_order: number;
          is_cover?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          entry_id?: string;
          version?: string;
          storage_path?: string;
          alt_text?: string;
          sort_order?: number;
          is_cover?: boolean;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: 'entry_media_entry_id_fkey'; columns: ["entry_id"]; isOneToOne: false; referencedRelation: 'entries'; referencedColumns: ["id"]; },
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
          relation_type_id: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          source_id: string;
          target_id: string;
          kind?: string;
          bidirectional?: boolean;
          created_at?: string;
          updated_at?: string;
          relation_type_id: string;
          created_by?: string | null;
        };
        Update: {
          id?: string;
          source_id?: string;
          target_id?: string;
          kind?: string;
          bidirectional?: boolean;
          created_at?: string;
          updated_at?: string;
          relation_type_id?: string;
          created_by?: string | null;
        };
        Relationships: [
          { foreignKeyName: 'entry_relations_created_by_fkey'; columns: ["created_by"]; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ["id"]; },
          { foreignKeyName: 'entry_relations_relation_type_id_fkey'; columns: ["relation_type_id"]; isOneToOne: false; referencedRelation: 'relation_types'; referencedColumns: ["id"]; },
          { foreignKeyName: 'entry_relations_source_id_fkey'; columns: ["source_id"]; isOneToOne: false; referencedRelation: 'entries'; referencedColumns: ["id"]; },
          { foreignKeyName: 'entry_relations_target_id_fkey'; columns: ["target_id"]; isOneToOne: false; referencedRelation: 'entries'; referencedColumns: ["id"]; },
        ];
      };
      external_images: {
        Row: {
          id: string;
          provider: string;
          source_id: string;
          metadata: Json;
          available: boolean;
          verified_at: string;
          created_at: string;
        };
        Insert: {
          id: string;
          provider: string;
          source_id: string;
          metadata: Json;
          available?: boolean;
          verified_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          provider?: string;
          source_id?: string;
          metadata?: Json;
          available?: boolean;
          verified_at?: string;
          created_at?: string;
        };
        Relationships: [
        ];
      };
      image_candidates: {
        Row: {
          id: string;
          gallery_key: string;
          url_key: string;
          provider: string;
          title: string;
          metadata: Json;
          additional_sources: Json;
          photo_id: string | null;
          relevance: number;
          rights_status: string;
          creator: string | null;
          license: string | null;
          license_url: string | null;
          rights_evidence: string | null;
          reviewed_by: string | null;
          verified_at: string | null;
          availability_status: string;
          is_excluded: boolean;
          reports: number;
          discovered_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          gallery_key: string;
          url_key: string;
          provider?: string;
          title?: string;
          metadata: Json;
          additional_sources?: Json;
          photo_id?: string | null;
          relevance?: number;
          rights_status?: string;
          creator?: string | null;
          license?: string | null;
          license_url?: string | null;
          rights_evidence?: string | null;
          reviewed_by?: string | null;
          verified_at?: string | null;
          availability_status?: string;
          is_excluded?: boolean;
          reports?: number;
          discovered_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          gallery_key?: string;
          url_key?: string;
          provider?: string;
          title?: string;
          metadata?: Json;
          additional_sources?: Json;
          photo_id?: string | null;
          relevance?: number;
          rights_status?: string;
          creator?: string | null;
          license?: string | null;
          license_url?: string | null;
          rights_evidence?: string | null;
          reviewed_by?: string | null;
          verified_at?: string | null;
          availability_status?: string;
          is_excluded?: boolean;
          reports?: number;
          discovered_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: 'image_candidates_gallery_key_fkey'; columns: ["gallery_key"]; isOneToOne: false; referencedRelation: 'image_galleries'; referencedColumns: ["cache_key"]; },
          { foreignKeyName: 'image_candidates_photo_id_fkey'; columns: ["photo_id"]; isOneToOne: false; referencedRelation: 'external_images'; referencedColumns: ["id"]; },
          { foreignKeyName: 'image_candidates_reviewed_by_fkey'; columns: ["reviewed_by"]; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ["id"]; },
        ];
      };
      image_galleries: {
        Row: {
          cache_key: string;
          place_source: string;
          place_kind: string;
          place_id: string;
          query_hash: string | null;
          next_page: number;
          query_index: number;
          pages: number;
          page_limit: number;
          state: string;
          stop_reason: string | null;
          credits: number;
          lease_id: string | null;
          lease_until: string | null;
          next_retry_at: string | null;
          searched_at: string | null;
          updated_at: string;
          development_previews: Json;
        };
        Insert: {
          cache_key: string;
          place_source: string;
          place_kind?: string;
          place_id: string;
          query_hash?: string | null;
          next_page?: number;
          query_index?: number;
          pages?: number;
          page_limit?: number;
          state?: string;
          stop_reason?: string | null;
          credits?: number;
          lease_id?: string | null;
          lease_until?: string | null;
          next_retry_at?: string | null;
          searched_at?: string | null;
          updated_at?: string;
          development_previews?: Json;
        };
        Update: {
          cache_key?: string;
          place_source?: string;
          place_kind?: string;
          place_id?: string;
          query_hash?: string | null;
          next_page?: number;
          query_index?: number;
          pages?: number;
          page_limit?: number;
          state?: string;
          stop_reason?: string | null;
          credits?: number;
          lease_id?: string | null;
          lease_until?: string | null;
          next_retry_at?: string | null;
          searched_at?: string | null;
          updated_at?: string;
          development_previews?: Json;
        };
        Relationships: [
        ];
      };
      image_resolution_cache: {
        Row: {
          cache_key: string;
          selected: string | null;
          candidates: (string)[];
          confidence: string;
          coordinate_evidence: boolean;
          reasons: (string)[];
          entity: string | null;
          expires_at: string;
          lease_id: string | null;
          lease_until: string | null;
        };
        Insert: {
          cache_key: string;
          selected?: string | null;
          candidates?: (string)[];
          confidence?: string;
          coordinate_evidence?: boolean;
          reasons?: (string)[];
          entity?: string | null;
          expires_at?: string;
          lease_id?: string | null;
          lease_until?: string | null;
        };
        Update: {
          cache_key?: string;
          selected?: string | null;
          candidates?: (string)[];
          confidence?: string;
          coordinate_evidence?: boolean;
          reasons?: (string)[];
          entity?: string | null;
          expires_at?: string;
          lease_id?: string | null;
          lease_until?: string | null;
        };
        Relationships: [
          { foreignKeyName: 'image_resolution_cache_selected_fkey'; columns: ["selected"]; isOneToOne: false; referencedRelation: 'external_images'; referencedColumns: ["id"]; },
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
      place_image_assignments: {
        Row: {
          id: string;
          entry_id: string | null;
          trip_id: string | null;
          visit_id: string | null;
          mode: string;
          image_id: string | null;
          assigned_by: string | null;
          revision: number;
          updated_at: string;
          country_id: string | null;
          city_id: string | null;
          neighborhood_id: string | null;
          category_id: string | null;
          gallery_key: string | null;
        };
        Insert: {
          id?: string;
          entry_id?: string | null;
          trip_id?: string | null;
          visit_id?: string | null;
          mode: string;
          image_id?: string | null;
          assigned_by?: string | null;
          revision?: number;
          updated_at?: string;
          country_id?: string | null;
          city_id?: string | null;
          neighborhood_id?: string | null;
          category_id?: string | null;
          gallery_key?: string | null;
        };
        Update: {
          id?: string;
          entry_id?: string | null;
          trip_id?: string | null;
          visit_id?: string | null;
          mode?: string;
          image_id?: string | null;
          assigned_by?: string | null;
          revision?: number;
          updated_at?: string;
          country_id?: string | null;
          city_id?: string | null;
          neighborhood_id?: string | null;
          category_id?: string | null;
          gallery_key?: string | null;
        };
        Relationships: [
          { foreignKeyName: 'place_image_assignments_assigned_by_fkey'; columns: ["assigned_by"]; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ["id"]; },
          { foreignKeyName: 'place_image_assignments_category_id_fkey'; columns: ["category_id"]; isOneToOne: true; referencedRelation: 'categories'; referencedColumns: ["id"]; },
          { foreignKeyName: 'place_image_assignments_city_id_fkey'; columns: ["city_id"]; isOneToOne: true; referencedRelation: 'cities'; referencedColumns: ["id"]; },
          { foreignKeyName: 'place_image_assignments_country_id_fkey'; columns: ["country_id"]; isOneToOne: true; referencedRelation: 'countries'; referencedColumns: ["id"]; },
          { foreignKeyName: 'place_image_assignments_entry_id_fkey'; columns: ["entry_id"]; isOneToOne: true; referencedRelation: 'entries'; referencedColumns: ["id"]; },
          { foreignKeyName: 'place_image_assignments_gallery_key_fkey'; columns: ["gallery_key"]; isOneToOne: true; referencedRelation: 'image_galleries'; referencedColumns: ["cache_key"]; },
          { foreignKeyName: 'place_image_assignments_image_id_fkey'; columns: ["image_id"]; isOneToOne: false; referencedRelation: 'external_images'; referencedColumns: ["id"]; },
          { foreignKeyName: 'place_image_assignments_neighborhood_id_fkey'; columns: ["neighborhood_id"]; isOneToOne: true; referencedRelation: 'neighborhoods'; referencedColumns: ["id"]; },
          { foreignKeyName: 'place_image_assignments_trip_id_fkey'; columns: ["trip_id"]; isOneToOne: false; referencedRelation: 'trips'; referencedColumns: ["id"]; },
        ];
      };
      profile_banner_garbage: {
        Row: {
          path: string;
          not_before: string;
        };
        Insert: {
          path: string;
          not_before?: string;
        };
        Update: {
          path?: string;
          not_before?: string;
        };
        Relationships: [
        ];
      };
      profile_customizations: {
        Row: {
          user_id: string;
          profile_title: string;
          bio: string;
          accent: string;
          banner_path: string | null;
          banner_x: number;
          banner_y: number;
          dream_country_id: string | null;
          dream_city_id: string | null;
          revision: number;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          profile_title?: string;
          bio?: string;
          accent?: string;
          banner_path?: string | null;
          banner_x?: number;
          banner_y?: number;
          dream_country_id?: string | null;
          dream_city_id?: string | null;
          revision?: number;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          profile_title?: string;
          bio?: string;
          accent?: string;
          banner_path?: string | null;
          banner_x?: number;
          banner_y?: number;
          dream_country_id?: string | null;
          dream_city_id?: string | null;
          revision?: number;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: 'profile_customizations_dream_city_id_fkey'; columns: ["dream_city_id"]; isOneToOne: false; referencedRelation: 'cities'; referencedColumns: ["id"]; },
          { foreignKeyName: 'profile_customizations_dream_country_id_fkey'; columns: ["dream_country_id"]; isOneToOne: false; referencedRelation: 'countries'; referencedColumns: ["id"]; },
          { foreignKeyName: 'profile_customizations_user_id_fkey'; columns: ["user_id"]; isOneToOne: true; referencedRelation: 'profiles'; referencedColumns: ["id"]; },
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
      relation_types: {
        Row: {
          id: string;
          slug: string;
          name: string;
          forward_label: string;
          inverse_label: string;
          is_symmetric: boolean;
          is_acyclic: boolean;
          sort_order: number;
          description: string;
          icon: string | null;
          is_enabled: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          forward_label: string;
          inverse_label: string;
          is_symmetric?: boolean;
          is_acyclic?: boolean;
          sort_order?: number;
          description?: string;
          icon?: string | null;
          is_enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          slug?: string;
          name?: string;
          forward_label?: string;
          inverse_label?: string;
          is_symmetric?: boolean;
          is_acyclic?: boolean;
          sort_order?: number;
          description?: string;
          icon?: string | null;
          is_enabled?: boolean;
          created_at?: string;
          updated_at?: string;
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
      trip_item_stops: {
        Row: {
          id: string;
          trip_item_id: string;
          entry_id: string | null;
          added_by: string | null;
          notes: string;
          duration_minutes: number | null;
          sort_order: number;
          version: number;
          created_at: string;
          updated_at: string;
          calendar_color: string | null;
          source: Database['public']['Enums']['trip_item_source'];
          external_place_id: string | null;
          custom_title: string | null;
          custom_location: string | null;
          custom_latitude: number | null;
          custom_longitude: number | null;
          external_query: string | null;
          needs_place_relink: boolean;
        };
        Insert: {
          id?: string;
          trip_item_id: string;
          entry_id?: string | null;
          added_by?: string | null;
          notes?: string;
          duration_minutes?: number | null;
          sort_order?: number;
          version?: number;
          created_at?: string;
          updated_at?: string;
          calendar_color?: string | null;
          source?: Database['public']['Enums']['trip_item_source'];
          external_place_id?: string | null;
          custom_title?: string | null;
          custom_location?: string | null;
          custom_latitude?: number | null;
          custom_longitude?: number | null;
          external_query?: string | null;
          needs_place_relink?: boolean;
        };
        Update: {
          id?: string;
          trip_item_id?: string;
          entry_id?: string | null;
          added_by?: string | null;
          notes?: string;
          duration_minutes?: number | null;
          sort_order?: number;
          version?: number;
          created_at?: string;
          updated_at?: string;
          calendar_color?: string | null;
          source?: Database['public']['Enums']['trip_item_source'];
          external_place_id?: string | null;
          custom_title?: string | null;
          custom_location?: string | null;
          custom_latitude?: number | null;
          custom_longitude?: number | null;
          external_query?: string | null;
          needs_place_relink?: boolean;
        };
        Relationships: [
          { foreignKeyName: 'trip_item_stops_added_by_fkey'; columns: ["added_by"]; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ["id"]; },
          { foreignKeyName: 'trip_item_stops_entry_id_fkey'; columns: ["entry_id"]; isOneToOne: false; referencedRelation: 'entries'; referencedColumns: ["id"]; },
          { foreignKeyName: 'trip_item_stops_trip_item_id_fkey'; columns: ["trip_item_id"]; isOneToOne: false; referencedRelation: 'trip_items'; referencedColumns: ["id"]; },
        ];
      };
      trip_items: {
        Row: {
          id: string;
          trip_id: string;
          trip_day_id: string | null;
          entry_id: string | null;
          added_by: string | null;
          notes: string;
          sort_order: number;
          created_at: string;
          updated_at: string;
          start_time: string | null;
          end_time: string | null;
          estimated_duration_minutes: number | null;
          version: number;
          calendar_color: string | null;
          source: Database['public']['Enums']['trip_item_source'];
          external_place_id: string | null;
          custom_title: string | null;
          custom_location: string | null;
          custom_latitude: number | null;
          custom_longitude: number | null;
          external_query: string | null;
          needs_place_relink: boolean;
        };
        Insert: {
          id?: string;
          trip_id: string;
          trip_day_id?: string | null;
          entry_id?: string | null;
          added_by?: string | null;
          notes?: string;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
          start_time?: string | null;
          end_time?: string | null;
          estimated_duration_minutes?: number | null;
          version?: number;
          calendar_color?: string | null;
          source?: Database['public']['Enums']['trip_item_source'];
          external_place_id?: string | null;
          custom_title?: string | null;
          custom_location?: string | null;
          custom_latitude?: number | null;
          custom_longitude?: number | null;
          external_query?: string | null;
          needs_place_relink?: boolean;
        };
        Update: {
          id?: string;
          trip_id?: string;
          trip_day_id?: string | null;
          entry_id?: string | null;
          added_by?: string | null;
          notes?: string;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
          start_time?: string | null;
          end_time?: string | null;
          estimated_duration_minutes?: number | null;
          version?: number;
          calendar_color?: string | null;
          source?: Database['public']['Enums']['trip_item_source'];
          external_place_id?: string | null;
          custom_title?: string | null;
          custom_location?: string | null;
          custom_latitude?: number | null;
          custom_longitude?: number | null;
          external_query?: string | null;
          needs_place_relink?: boolean;
        };
        Relationships: [
          { foreignKeyName: 'trip_items_added_by_fkey'; columns: ["added_by"]; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ["id"]; },
          { foreignKeyName: 'trip_items_entry_id_fkey'; columns: ["entry_id"]; isOneToOne: false; referencedRelation: 'entries'; referencedColumns: ["id"]; },
          { foreignKeyName: 'trip_items_trip_day_id_trip_id_fkey'; columns: ["trip_day_id","trip_id"]; isOneToOne: false; referencedRelation: 'trip_days'; referencedColumns: ["id","trip_id"]; },
          { foreignKeyName: 'trip_items_trip_id_fkey'; columns: ["trip_id"]; isOneToOne: false; referencedRelation: 'trips'; referencedColumns: ["id"]; },
        ];
      };
      trip_organizers: {
        Row: {
          trip_id: string;
          user_id: string;
          created_at: string;
        };
        Insert: {
          trip_id: string;
          user_id: string;
          created_at?: string;
        };
        Update: {
          trip_id?: string;
          user_id?: string;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: 'trip_organizers_trip_id_fkey'; columns: ["trip_id"]; isOneToOne: false; referencedRelation: 'trips'; referencedColumns: ["id"]; },
          { foreignKeyName: 'trip_organizers_user_id_fkey'; columns: ["user_id"]; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ["id"]; },
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
          destination_country_id: string | null;
          timezone: string;
          collaboration_mode: Database['public']['Enums']['trip_collaboration_mode'];
          version: number;
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
          destination_country_id?: string | null;
          timezone?: string;
          collaboration_mode?: Database['public']['Enums']['trip_collaboration_mode'];
          version?: number;
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
          destination_country_id?: string | null;
          timezone?: string;
          collaboration_mode?: Database['public']['Enums']['trip_collaboration_mode'];
          version?: number;
        };
        Relationships: [
          { foreignKeyName: 'trips_created_by_fkey'; columns: ["created_by"]; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ["id"]; },
          { foreignKeyName: 'trips_destination_country_id_fkey'; columns: ["destination_country_id"]; isOneToOne: false; referencedRelation: 'countries'; referencedColumns: ["id"]; },
          { foreignKeyName: 'trips_guild_id_fkey'; columns: ["guild_id"]; isOneToOne: false; referencedRelation: 'discord_guilds'; referencedColumns: ["id"]; },
        ];
      };
      user_calendar_colors: {
        Row: {
          id: string;
          user_id: string;
          hex_color: string;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          hex_color: string;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          hex_color?: string;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: 'user_calendar_colors_user_id_fkey'; columns: ["user_id"]; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ["id"]; },
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
      account_deletion_ready: { Args: Record<PropertyKey, never>; Returns: boolean; };
      acquire_bot_lease: { Args: { p_application_id: string; p_scope: string; p_instance: string }; Returns: string; };
      can_create_guild_trip: { Args: { p_guild_id: string }; Returns: boolean; };
      can_edit_guild_trip: { Args: { p_trip_id: string }; Returns: boolean; };
      can_read_image_visit: { Args: { p_trip: string; p_visit: string }; Returns: boolean; };
      can_read_profile_banner: { Args: { p_viewer: string; p_target: string; p_app: string; p_path: string }; Returns: boolean; };
      catalog_categories_at: { Args: { p_city: string; p_neighborhood: string }; Returns: Database['public']['Tables']['categories']['Row'][]; };
      catalog_edit_media: { Args: { p_entry: string; p_operation: string; p_data: Json }; Returns: undefined; };
      catalog_edit_relation: { Args: { p_entry: string; p_id: string; p_expected: string; p_other: string; p_type: string; p_direction: string; p_delete: boolean }; Returns: Json; };
      catalog_order_categories: { Args: { p_ids: (string)[] }; Returns: undefined; };
      catalog_order_relation_types: { Args: { p_ids: (string)[] }; Returns: undefined; };
      catalog_remove_category: { Args: { p_id: string; p_destination: string }; Returns: number; };
      catalog_remove_relation_type: { Args: { p_id: string; p_destination: string; p_expected: string }; Returns: number; };
      catalog_save_relation_type: { Args: { p_id: string; p_data: Json }; Returns: string; };
      catalog_search_key: { Args: { value: string }; Returns: string; };
      catalog_toggle_relation_type: { Args: { p_id: string; p_enabled: boolean; p_expected: string }; Returns: undefined; };
      claim_bot_sync: { Args: { p_application_id: string; p_scope: string; p_token: string }; Returns: Database['public']['Tables']['bot_sync_requests']['Row'][]; };
      claim_discord_refresh: { Args: { p_user_id: string; p_version: number; p_lease: string }; Returns: boolean; };
      configure_owners: { Args: { p_ids: (string)[] }; Returns: undefined; };
      edit_trip_plan: { Args: { p_guild: string; p_trip: string; p_version: number; p_operation: string; p_data: Json }; Returns: number; };
      enqueue_bot_sync: { Args: { p_application_id: string; p_scope: string; p_reason: string }; Returns: string; };
      finish_bot_sync: { Args: { p_id: string; p_token: string; p_success: boolean; p_error: string; p_commands: Json }; Returns: undefined; };
      finish_discord_refresh: { Args: { p_user_id: string; p_lease: string; p_encrypted_tokens: string; p_expires_at: string; p_scopes: (string)[] }; Returns: boolean; };
      finish_image_discovery: { Args: { p_key: string; p_lease: string; p_items?: Json | null; p_credits?: number | null; p_error?: string | null; p_retry?: number | null; p_variant_count?: number | null }; Returns: boolean; };
      is_guild_admin: { Args: { p_guild_id: string }; Returns: boolean; };
      is_guild_member: { Args: { p_guild_id: string }; Returns: boolean; };
      is_nagi_admin: { Args: Record<PropertyKey, never>; Returns: boolean; };
      is_trip_organizer: { Args: { p_trip_id: string }; Returns: boolean; };
      mapbox_admin: { Args: { p_enabled?: boolean | null }; Returns: Json; };
      mapbox_available: { Args: Record<PropertyKey, never>; Returns: boolean; };
      mapbox_error: { Args: { p_code: string }; Returns: undefined; };
      mapbox_place_reference: { Args: { p_actor: string; p_id: string; p_query: string }; Returns: undefined; };
      mutate_trip_plan: { Args: { p_guild: string; p_trip: string; p_request: Json }; Returns: Json; };
      read_discord_credentials: { Args: { p_user_id: string }; Returns: Json; };
      read_discord_guild_snapshot: { Args: { p_user_id: string; p_application_id: string }; Returns: Json; };
      read_social_profile: { Args: { p_viewer: string; p_target: string; p_app: string }; Returns: Json; };
      read_trip_changes: { Args: { p_guild: string; p_trip: string; p_after: number }; Returns: Json; };
      reconcile_discord_guilds: { Args: { p_application_id: string; p_guilds: Json }; Returns: undefined; };
      record_discord_memberships: { Args: { p_user_id: string; p_application_id: string; p_guilds: Json }; Returns: undefined; };
      refresh_social_identity: { Args: { p_user: string; p_discord: string; p_profile: Json }; Returns: undefined; };
      release_bot_lease: { Args: { p_application_id: string; p_scope: string; p_token: string }; Returns: undefined; };
      release_discord_refresh: { Args: { p_user_id: string; p_lease: string }; Returns: undefined; };
      renew_bot_lease: { Args: { p_application_id: string; p_scope: string; p_token: string; p_connected: boolean }; Returns: boolean; };
      reserve_image_discovery: { Args: { p_actor: string; p_key: string; p_query_hash: string; p_pages?: number | null; p_total_pages?: number | null; p_concurrent?: number | null; p_global_day?: number | null; p_user_day?: number | null; p_user_minute?: number | null; p_continue?: boolean | null; p_refresh?: boolean | null; p_refresh_seconds?: number | null }; Returns: Json; };
      reserve_image_resolution: { Args: { p_actor: string; p_key: string; p_openverse?: boolean | null; p_coordinates?: boolean | null }; Returns: string; };
      reserve_mapbox_places: { Args: { p_actor: string; p_kind: string; p_user_daily: number; p_global_daily: number; p_user_minute: number; p_details_monthly: number }; Returns: undefined; };
      resolve_social_profile: { Args: { p_handle: string }; Returns: Json; };
      review_image_candidate: { Args: { p_id: string; p_status: string; p_creator?: string | null; p_license?: string | null; p_license_url?: string | null; p_evidence?: string | null; p_excluded?: boolean | null }; Returns: undefined; };
      revoke_discord_credentials: { Args: { p_user_id: string; p_version: number }; Returns: undefined; };
      save_discord_credentials: { Args: { p_user_id: string; p_discord_id: string; p_profile: Json; p_encrypted_tokens: string; p_expires_at: string; p_scopes: (string)[] }; Returns: undefined; };
      save_social_customization: { Args: { p_user: string; p_revision: number; p_data: Json }; Returns: number; };
      save_user_calendar_color: { Args: { p_hex: string }; Returns: Json; };
      set_catalog_image: { Args: { p_key: string; p_mode?: string | null; p_image?: string | null; p_revision?: number | null }; Returns: number; };
      set_discord_guild_presence: { Args: { p_application_id: string; p_guild: Json; p_present: boolean }; Returns: undefined; };
      set_image_preview: { Args: { p_actor: string; p_key: string; p_mode: string; p_image?: string | null; p_revision?: number | null; p_visit?: string | null }; Returns: number; };
      set_place_image: { Args: { p_entry?: string | null; p_trip?: string | null; p_visit?: string | null; p_mode?: string | null; p_image?: string | null; p_revision?: number | null }; Returns: number; };
      social_profile_trips: { Args: { p_viewer: string; p_target: string; p_app: string; p_offset: number }; Returns: Json; };
      sync_discord_profile: { Args: Record<PropertyKey, never>; Returns: Database['public']['Tables']['profiles']['Row']; };
      trip_author_card: { Args: { p_trip_id: string }; Returns: Json; };
      trip_contributor_cards: { Args: { p_trip: string }; Returns: Json; };
      trip_organizer_cards: { Args: { p_trip: string }; Returns: Json; };
    };
    Enums: {
      app_role: "user" | "admin" | "owner";
      catalog_field_type: "short_text" | "long_text" | "number" | "boolean" | "url" | "date" | "select" | "multi_select" | "buttons";
      trip_collaboration_mode: "all_members" | "organizers_only";
      trip_item_source: "nagi" | "mapbox" | "custom";
      trip_status: "planned" | "ongoing" | "completed" | "cancelled" | "draft" | "archived";
    };
    CompositeTypes: { [_ in never]: never };
  };
};
