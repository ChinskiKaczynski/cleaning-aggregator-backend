import { LatLngLiteral } from './company';

export interface Database {
  public: {
    Tables: {
      companies: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          address: string;
          coordinates: LatLngLiteral;
          services: string[];
          prices: {
            basePrice: number;
            pricePerHour: number;
            minimumHours?: number;
          };
          contact: {
            phone?: string;
            email?: string;
            website?: string;
          } | null;
          rating: number | null;
          review_count: number | null;
          created_at: string;
          updated_at: string;
          geom: unknown;
        };
        Insert: Omit<
          Database['public']['Tables']['companies']['Row'],
          'id' | 'created_at' | 'updated_at' | 'geom'
        >;
        Update: Partial<
          Database['public']['Tables']['companies']['Insert']
        >;
      };
      reviews: {
        Row: {
          id: string;
          company_id: string;
          rating: number;
          content: string;
          author_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database['public']['Tables']['reviews']['Row'],
          'id' | 'created_at' | 'updated_at'
        >;
        Update: Partial<
          Database['public']['Tables']['reviews']['Insert']
        >;
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      find_companies_in_radius: {
        Args: {
          lat: number;
          lng: number;
          radius_km: number;
          results_limit?: number;
        };
        Returns: Array<
          Database['public']['Tables']['companies']['Row'] & {
            distance_km: number;
          }
        >;
      };
      refresh_spatial_index: {
        Args: Record<string, never>;
        Returns: void;
      };
    };
    Enums: {
      [_ in never]: never;
    };
  };
}