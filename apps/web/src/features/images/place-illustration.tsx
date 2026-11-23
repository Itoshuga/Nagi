'use client';
import { useId } from 'react';

export function illustrationCategory(category?: string) {
  const value = category?.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase() ?? '';
  if (/cafe|coffee|(^|[\s_-])tea($|[\s_-])/.test(value)) return 'cafe';
  if (/restaurant|food|dining|gastronom|utensil/.test(value)) return 'restaurant';
  if (/hotel|lodging|hebergement/.test(value)) return 'hotel';
  if (/museum|musee|gallery|galerie/.test(value)) return 'museum';
  if (/park|parc|garden|jardin|nature/.test(value)) return 'park';
  if (/shop|store|retail|mall|shopping|magasin|commercial|produit/.test(value)) return 'shop';
  if (/station|rail|gare|train/.test(value)) return 'station';
  if (/airport|aeroport|plane/.test(value)) return 'airport';
  if (/temple|shrine|monument|landmark|attraction|touris/.test(value)) return 'landmark';
  return 'place';
}
const labels = {
  cafe: 'café',
  restaurant: 'restaurant',
  hotel: 'hôtel',
  museum: 'musée',
  park: 'parc',
  shop: 'boutique',
  station: 'gare',
  airport: 'aéroport',
  landmark: 'site à visiter',
  place: 'lieu',
};
/** Original vector illustrations, clearly distinct from venue photography. */
export function PlaceIllustration({ category }: { category?: string }) {
  const kind = illustrationCategory(category),
    gradient = useId();
  const green = kind === 'park',
    warm = kind === 'cafe' || kind === 'restaurant';
  const sky = green ? '#e7f0e9' : warm ? '#f5ece2' : '#e9f1fa';
  const mist = green ? '#c5ddce' : warm ? '#e4ccb3' : '#cfdfef';
  const ink = green ? '#5e8e7a' : warm ? '#a77d59' : '#6b8fb1';
  const dark = green ? '#446f5c' : warm ? '#805a41' : '#466c92';
  return (
    <svg
      role="img"
      aria-label={`Illustration de ${labels[kind]}`}
      data-place-illustration={kind}
      viewBox="0 0 240 160"
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 size-full"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={gradient} x2="0.65" y2="1">
          <stop stopColor={sky} />
          <stop offset="1" stopColor={mist} />
        </linearGradient>
      </defs>
      <rect width="240" height="160" fill={`url(#${gradient})`} />
      <circle cx="184" cy="39" r="17" fill="#fff7df" />
      <path d="M-12 108Q45 72 99 103T252 93V160H-12Z" fill={mist} opacity=".6" />
      <path d="M0 137Q68 112 124 132T240 125V160H0Z" fill={ink} opacity=".13" />
      <g fill="none" stroke={dark} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        {kind === 'park' ? (
          <>
            <path d="M108 160Q167 125 119 106Q90 94 137 76" stroke="#f9f6e9" strokeWidth="20" />
            <path d="M61 123V83M177 126V90" stroke={dark} strokeWidth="5" />
            <ellipse cx="61" cy="75" rx="28" ry="34" fill={ink} stroke="none" />
            <ellipse cx="177" cy="78" rx="23" ry="29" fill={dark} opacity=".85" stroke="none" />
            <path d="M46 72L61 86L74 68" stroke={sky} opacity=".45" />
            <path d="M37 136H89M151 140H201" opacity=".35" />
          </>
        ) : kind === 'landmark' ? (
          <>
            <path d="M67 125V91H174V125" fill={sky} />
            <path d="M58 93Q82 85 94 69H148Q163 85 183 93Z" fill={ink} />
            <path d="M80 72Q105 61 120 44Q135 61 160 72Z" fill={dark} />
            <path d="M120 36V48" />
            <path d="M80 104H161M90 96V124M152 96V124" opacity=".5" />
            <path d="M108 125V107H132V125" fill={ink} />
            <path d="M58 127H183M78 135H163" />
          </>
        ) : kind === 'museum' ? (
          <>
            <path d="M58 78L120 46L182 78Z" fill={ink} />
            <path d="M63 83H177M63 123H177M57 133H183" strokeWidth="6" />
            <path d="M77 88V118M105 88V118M135 88V118M163 88V118" stroke={ink} strokeWidth="10" />
            <circle cx="120" cy="65" r="5" fill={sky} stroke="none" />
          </>
        ) : kind === 'cafe' ? (
          <>
            <path d="M72 83H153V107Q151 127 112 127Q74 127 72 107Z" fill={sky} />
            <path d="M154 87H166Q181 88 177 100Q173 113 155 111" strokeWidth="6" />
            <path d="M64 134Q113 144 168 134" strokeWidth="5" />
            <path
              d="M98 69Q88 59 99 46M120 69Q110 57 122 43M142 68Q133 58 143 49"
              stroke={ink}
              opacity=".7"
            />
            <path d="M83 91H144" stroke={ink} opacity=".25" />
          </>
        ) : kind === 'restaurant' ? (
          <>
            <circle cx="123" cy="95" r="38" fill={sky} />
            <circle cx="123" cy="95" r="29" stroke={ink} opacity=".6" />
            <path
              d="M66 60V89M57 60V78Q66 91 75 78V60M66 89V132M183 61Q170 85 181 94V132"
              strokeWidth="4"
            />
            <path d="M105 96Q119 75 140 91Q128 113 105 96Z" fill={ink} stroke="none" />
            <path d="M115 95L133 92" stroke={sky} />
            <circle cx="132" cy="106" r="4" fill="#c2b176" stroke="none" />
          </>
        ) : kind === 'shop' ? (
          <>
            <path d="M66 82H174V131H66Z" fill={sky} />
            <path d="M63 58H177L187 83H53Z" fill={ink} />
            <path
              d="M76 60L72 81M105 60L103 81M135 60L137 81M164 60L168 81"
              stroke={sky}
              strokeWidth="9"
            />
            <path
              d="M53 83Q62 96 73 83Q84 96 103 83Q121 96 137 83Q155 96 168 83Q180 96 187 83"
              fill={ink}
            />
            <path d="M79 101H110V119H79Z" fill={mist} />
            <path d="M132 132V99H160V132" fill={ink} />
            <path d="M59 134H181" />
          </>
        ) : kind === 'hotel' ? (
          <>
            <path d="M78 49H163V133H78Z" fill={sky} />
            <path d="M69 134H172M89 42H152" />
            <path
              d="M94 66H107V79H94ZM133 66H146V79H133ZM94 93H107V106H94ZM133 93H146V106H133Z"
              fill={ink}
              stroke="none"
            />
            <path d="M112 134V116H129V134" fill={dark} />
            <path d="M112 50V38H130V50" fill={mist} />
          </>
        ) : kind === 'station' ? (
          <>
            <rect x="79" y="45" width="84" height="80" rx="17" fill={sky} />
            <path d="M91 66H151V95H91Z" fill={ink} />
            <path d="M119 66V95" stroke={sky} />
            <path d="M91 112H102M140 112H150" strokeWidth="5" />
            <path d="M93 127L77 145M149 127L165 145M82 138H160M102 53H139" />
          </>
        ) : kind === 'airport' ? (
          <>
            <path d="M48 140H193" opacity=".4" />
            <path d="M80 123V90H105V123M75 91L70 69H114L107 91Z" fill={sky} />
            <path
              d="M93 70V56M153 88L127 82L137 72L161 74L182 53L190 59L173 82L177 104L167 113L160 91L143 105L134 103Z"
              fill={ink}
            />
          </>
        ) : (
          <>
            <path d="M59 130V92L88 72L117 92V130" fill={sky} />
            <path d="M113 130V72L150 52L184 72V130" fill={mist} />
            <path d="M51 94L88 66L123 93M107 75L150 47L191 74" stroke={ink} strokeWidth="5" />
            <path
              d="M78 130V108H97V130M132 82H143V94H132ZM159 82H170V94H159ZM146 132V111H161V132"
              fill={ink}
              stroke="none"
            />
            <path d="M49 133H195" />
          </>
        )}
      </g>
      <path
        d="M24 125V110M18 118L24 111L30 118M211 132V117M205 125L211 118L217 125"
        fill="none"
        stroke={ink}
        strokeWidth="2"
        strokeLinecap="round"
        opacity=".5"
      />
    </svg>
  );
}
