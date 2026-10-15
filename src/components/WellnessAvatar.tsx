import React from 'react';
import type { WellnessReminderKind } from '../services/wellnessReminder.service';

interface WellnessAvatarProps {
  kind: WellnessReminderKind;
}

const WellnessAvatar: React.FC<WellnessAvatarProps> = ({ kind }) => (
  <div className={`wellness-puppy ${kind}`} role="img" aria-label={`Animated puppy for ${kind} reminder`}>
    <svg viewBox="0 0 240 220" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="puppy-coat" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffd38b" />
          <stop offset="1" stopColor="#e99b55" />
        </linearGradient>
        <linearGradient id="puppy-muzzle" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff2dc" />
          <stop offset="1" stopColor="#f1d8b8" />
        </linearGradient>
        <linearGradient id="puppy-bottle" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8de5ff" />
          <stop offset="1" stopColor="#4299d3" />
        </linearGradient>
        <filter id="puppy-shadow" x="-30%" y="-30%" width="160%" height="170%">
          <feDropShadow dx="0" dy="5" stdDeviation="5" floodColor="#593a26" floodOpacity=".16" />
        </filter>
      </defs>

      <ellipse className="puppy-ground-shadow" cx="116" cy="198" rx="72" ry="10" />
      <g className="puppy-character" filter="url(#puppy-shadow)">
        <path className="puppy-tail" d="M160 145 C192 140 190 111 174 111 C165 111 165 123 174 125" />
        <path fill="url(#puppy-coat)" d="M48 145 C50 118 71 105 111 106 C150 106 169 126 168 164 L159 184 L56 184 C48 172 45 159 48 145Z" />
        <path fill="#c67c43" d="M65 159 C67 146 78 139 87 144 L91 184 L66 184Z" />
        <path fill="#c67c43" d="M128 151 C139 144 150 150 150 160 L151 184 L127 184Z" />
        <path className="puppy-back-leg" fill="#d98d4b" d="M87 163 C98 158 107 164 106 176 L104 189 L80 189 C78 177 80 168 87 163Z" />
        <path className="puppy-front-leg" fill="#f0ad67" d="M115 161 C128 157 136 164 135 177 L133 190 L110 190 C108 178 109 167 115 161Z" />
        <path fill="#7a4832" d="M79 187 H106 C110 187 111 193 107 196 H77 C74 194 75 189 79 187Z" />
        <path fill="#7a4832" d="M109 188 H135 C139 188 140 194 136 197 H108 C104 195 105 190 109 188Z" />
        <g className="puppy-head">
        <path fill="url(#puppy-coat)" d="M53 95 C52 64 76 43 111 43 C149 43 171 68 168 101 C166 129 146 146 112 146 C78 146 56 128 53 95Z" />
        <path className="puppy-ear puppy-ear-left" fill="#9c5c39" d="M67 70 C43 47 39 76 48 104 C54 122 69 115 76 101Z" />
        <path className="puppy-ear puppy-ear-right" fill="#9c5c39" d="M145 66 C163 42 181 61 174 96 C170 115 154 116 145 102Z" />
        <path fill="url(#puppy-muzzle)" d="M71 101 C74 83 91 77 111 79 C135 77 151 89 151 105 C151 123 135 135 112 135 C88 135 70 122 71 101Z" />
        <ellipse className="puppy-eye puppy-eye-left" cx="89" cy="88" rx="4.5" ry="6" />
        <ellipse className="puppy-eye puppy-eye-right" cx="133" cy="88" rx="4.5" ry="6" />
        <path className="puppy-closed-eye" d="M83 89 Q89 94 95 89 M127 89 Q133 94 139 89" />
        <ellipse fill="#573729" cx="111" cy="105" rx="10" ry="7" />
        <path className="puppy-mouth" d="M111 112 Q107 120 100 119 M111 112 Q115 120 122 119" />
        <path className="puppy-yawn" d="M101 114 Q111 128 122 114 Q120 132 111 132 Q102 130 101 114Z" />
        <path fill="#e95c69" d="M105 128 Q111 132 117 128 Q116 139 111 139 Q106 137 105 128Z" />
        <path fill="#53b9d7" d="M77 137 Q111 151 148 137 L153 146 Q111 163 72 146Z" />
        <path fill="#f4d66d" d="M105 147 L111 153 L117 147 L115 160 L107 160Z" />
        </g>
      </g>

      <g className="puppy-water-bottle">
        <path fill="url(#puppy-bottle)" stroke="#2879a5" strokeWidth="2" d="M184 128 H204 V141 L210 149 V181 Q210 187 204 187 H184 Q178 187 178 181 V149 L184 141Z" />
        <path fill="#e8fbff" opacity=".8" d="M184 157 H204 V179 H184Z" />
        <path fill="#2879a5" d="M187 121 H201 V130 H187Z" />
        <path fill="#fff" opacity=".8" d="M187 151 H191 V174 H187Z" />
      </g>
      <g className="puppy-sleep-z" fill="#7774d7" fontFamily="system-ui, sans-serif" fontWeight="700">
        <text x="166" y="83" fontSize="16">z</text>
        <text x="182" y="66" fontSize="21">z</text>
        <text x="202" y="45" fontSize="26">Z</text>
      </g>
      <path className="puppy-sparkle" d="M41 80 V68 M35 74 H47 M188 106 V98 M184 102 H192" />
    </svg>
  </div>
);

export default WellnessAvatar;