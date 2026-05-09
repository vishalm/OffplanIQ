// apps/web/lib/insights/schema.ts
// The schema we expose to the LLM for text-to-SQL. Only these tables and
// columns can appear in a generated query plan — anything else is rejected
// at validation time. This is the single source of truth for what's
// queryable; keep it tight.

export type ColumnType = 'string' | 'number' | 'date' | 'boolean' | 'array'

export interface ColumnDef {
  name: string
  type: ColumnType
  description: string
  /** Sample values to show the LLM when relevant (e.g. enums). */
  examples?: string[]
}

export interface TableDef {
  name: string
  description: string
  columns: ColumnDef[]
  /** Single-hop joins this table allows. Only via these named relationships. */
  joins?: Array<{
    name:        string                 // alias the LLM uses, e.g. 'developer'
    target:      string                 // target table name
    description: string
    expose:      string[]               // columns from target that can be selected/filtered
  }>
}

export const ALLOWED_TABLES: TableDef[] = [
  {
    name: 'projects',
    description: 'UAE off-plan property projects. Core table — every row is one project.',
    columns: [
      { name: 'name',                  type: 'string', description: 'Project name.' },
      { name: 'slug',                  type: 'string', description: 'URL-safe project identifier.' },
      { name: 'area',                  type: 'string', description: 'Sub-community / district, e.g. "Business Bay", "JVC".' },
      { name: 'city',                  type: 'string', description: 'Emirate.', examples: ['Dubai','Abu Dhabi','Sharjah','Ajman','Ras Al Khaimah','Fujairah','Umm Al Quwain'] },
      { name: 'status',                type: 'string', description: 'Project lifecycle.', examples: ['active','pre_launch','sold_out','completed','cancelled'] },
      { name: 'handover_status',       type: 'string', description: 'Where the project sits in the handover pipeline.', examples: ['pre_launch','under_construction','near_handover','handed_over','delayed'] },
      { name: 'unit_types',            type: 'array',  description: 'Array of offered unit types.', examples: ['studio','1br','2br','3br','4br','penthouse','villa','townhouse','duplex'] },
      { name: 'total_units',           type: 'number', description: 'Total units in the project.' },
      { name: 'units_sold',            type: 'number', description: 'Units sold so far.' },
      { name: 'sellthrough_pct',       type: 'number', description: 'Percentage of units sold (0-100).' },
      { name: 'launch_psf',            type: 'number', description: 'AED per square foot at launch.' },
      { name: 'current_psf',           type: 'number', description: 'Latest AED per square foot.' },
      { name: 'min_price',             type: 'number', description: 'Minimum unit price in AED.' },
      { name: 'max_price',             type: 'number', description: 'Maximum unit price in AED.' },
      { name: 'score',                 type: 'number', description: 'OffplanIQ proprietary score, 0-100.' },
      { name: 'current_handover_date', type: 'date',   description: 'Expected handover date (ISO YYYY-MM-DD).' },
      { name: 'handover_delay_days',   type: 'number', description: 'Days delayed vs original handover. 0 if on schedule.' },
      { name: 'launch_date',           type: 'date',   description: 'Project launch date.' },
      { name: 'created_at',            type: 'date',   description: 'Row creation timestamp.' },
    ],
    joins: [
      {
        name:        'developer',
        target:      'developers',
        description: 'The developer that owns the project.',
        expose:      ['name','slug','tier','tier_rank','developer_score','total_projects_count','active_projects','founded_year','hq_location'],
      },
    ],
  },
  {
    name: 'developers',
    description: 'Property developer companies operating in the UAE.',
    columns: [
      { name: 'name',                  type: 'string', description: 'Developer name.' },
      { name: 'slug',                  type: 'string', description: 'URL-safe identifier.' },
      { name: 'tier',                  type: 'string', description: 'Curated tier label.', examples: ['Tier 1','Tier 2','Tier 3','Tier 4'] },
      { name: 'tier_rank',             type: 'number', description: 'Numeric tier (1 = top, 4 = long-tail).' },
      { name: 'developer_score',       type: 'number', description: 'Composite score 0-100.' },
      { name: 'total_projects_count',  type: 'number', description: 'Total projects ever launched.' },
      { name: 'active_projects',       type: 'number', description: 'Projects currently active (not sold-out / completed).' },
      { name: 'founded_year',          type: 'number', description: 'Year the developer was founded.' },
      { name: 'hq_location',           type: 'string', description: 'Headquarters city/emirate.' },
      { name: 'ownership_type',        type: 'string', description: 'Ownership category.' },
      { name: 'employees',             type: 'string', description: 'Approximate employee count band.' },
    ],
  },
  {
    name: 'project_updates',
    description: 'Append-only log of detected changes to projects (price moves, handover slips, launches).',
    columns: [
      { name: 'change_type',  type: 'string', description: 'Category of change.', examples: ['launch','price_change','handover_change','units_change','description_change','amenities_change','plan_change'] },
      { name: 'field',        type: 'string', description: 'Which column changed (e.g. "current_psf", "current_handover_date").' },
      { name: 'before_value', type: 'string', description: 'Previous value (text representation).' },
      { name: 'after_value',  type: 'string', description: 'New value (text representation).' },
      { name: 'delta_pct',    type: 'number', description: 'Percentage change when applicable (-100 to +large).' },
      { name: 'detected_at',  type: 'date',   description: 'When the change was detected.' },
    ],
    joins: [
      {
        name:        'project',
        target:      'projects',
        description: 'The project this update belongs to.',
        expose:      ['name','slug','area','city','score'],
      },
    ],
  },
]

export function tableByName(name: string): TableDef | undefined {
  return ALLOWED_TABLES.find(t => t.name === name)
}

/** Render the schema as a compact prompt the LLM can reason over. */
export function schemaForPrompt(): string {
  return ALLOWED_TABLES.map(t => {
    const cols = t.columns
      .map(c => `  ${c.name} (${c.type})${c.examples ? ` — examples: ${c.examples.slice(0, 6).join(', ')}` : ''} — ${c.description}`)
      .join('\n')
    const joins = (t.joins ?? [])
      .map(j => `  JOIN AS "${j.name}" → ${j.target} (expose: ${j.expose.join(', ')}) — ${j.description}`)
      .join('\n')
    return `TABLE ${t.name} — ${t.description}\n${cols}${joins ? `\n${joins}` : ''}`
  }).join('\n\n')
}
