import { COMPANY_DOMAIN } from '@/lib/constants'
import { countyLabel } from '@/lib/counties'
import type { DirectoryContact } from '@/types/professionals'
import type { BodyShopContact } from '@/types/body-shops'
import {
  sendEmail, escapeHtml, INTERNAL_EMAIL,
  wrapInLayout, logoBar, headerBannerWithBadge, detailsCard, ctaButton, footer,
} from '../base'

export interface DirectoryInquiry {
  name: string
  email: string
  phone: string
}

/**
 * The lead from the public directory's "Get information" form.
 *
 * Internal only. The visitor has already been shown the firm's contact
 * details on the page, so this is the team's copy of who asked about
 * whom — the same row also lands in /admin/contacts.
 */
export function directoryInquiryEmail(
  visitor: DirectoryInquiry,
  firm: DirectoryContact & { city?: string | null; county?: string; practiceAreas: string[] }
) {
  const safe = {
    name: escapeHtml(visitor.name),
    email: escapeHtml(visitor.email),
    phone: escapeHtml(visitor.phone),
    firm: escapeHtml(firm.name),
  }
  const place = [firm.city, firm.county ? countyLabel(firm.county) : '']
    .filter(Boolean)
    .join(', ')

  return sendEmail({
    to: INTERNAL_EMAIL,
    subject: `Directory lead: ${safe.name} asked about ${safe.firm}`,
    html: wrapInLayout(`
      ${logoBar()}
      ${headerBannerWithBadge('New Directory Lead', 'Someone requested a lawyer&rsquo;s information', 'linear-gradient(135deg,#1e3a5f 0%,#2c5282 50%,#3b6cb5 100%)', 'Internal')}

      <div style="padding:36px 32px;">
        ${detailsCard('Visitor', 'linear-gradient(135deg,#1e3a5f 0%,#2c5282 100%)', [
          { label: 'Name', value: safe.name },
          { label: 'Phone', value: `<a href="tel:${safe.phone}" style="color:#2c5282;text-decoration:none;">${safe.phone}</a>` },
          { label: 'Email', value: `<a href="mailto:${safe.email}" style="color:#2c5282;text-decoration:none;">${safe.email}</a>` },
        ])}

        ${detailsCard('Lawyer requested', 'linear-gradient(135deg,#92400e 0%,#b45309 100%)', [
          { label: 'Firm', value: safe.firm },
          ...(place ? [{ label: 'Location', value: escapeHtml(place) }] : []),
          ...(firm.practiceAreas.length
            ? [{ label: 'Practice areas', value: escapeHtml(firm.practiceAreas.join(', ')) }]
            : []),
          { label: 'Firm phone', value: escapeHtml(firm.phone) },
          ...(firm.website ? [{ label: 'Website', value: escapeHtml(firm.website) }] : []),
          { label: 'Directory id', value: escapeHtml(firm.id) },
        ])}

        ${ctaButton('View in Admin Dashboard', `${COMPANY_DOMAIN}/admin/contacts`, 'linear-gradient(135deg,#1e3a5f 0%,#2c5282 100%)', 'rgba(44,82,130,0.35)')}
      </div>

      ${footer('Internal automated notification from the public lawyers directory.')}
    `),
  })
}

/**
 * The lead from the Body Shops Directory's "Get information" form.
 *
 * The lawyers email above, reworded. Internal only: the visitor has already
 * been shown the shop's contact details, and the same lead is a row in
 * /admin/contacts.
 */
export function bodyShopInquiryEmail(
  visitor: DirectoryInquiry,
  shop: BodyShopContact & { city: string; county: string; state: string; kind: string }
) {
  const safe = {
    name: escapeHtml(visitor.name),
    email: escapeHtml(visitor.email),
    phone: escapeHtml(visitor.phone),
    shop: escapeHtml(shop.name),
  }
  const place = [shop.city, shop.county ? countyLabel(shop.county) : '', shop.state]
    .filter(Boolean)
    .join(', ')

  return sendEmail({
    to: INTERNAL_EMAIL,
    subject: `Body shop lead: ${safe.name} asked about ${safe.shop}`,
    html: wrapInLayout(`
      ${logoBar()}
      ${headerBannerWithBadge('New Body Shop Lead', 'Someone requested a body shop&rsquo;s information', 'linear-gradient(135deg,#1e3a5f 0%,#2c5282 50%,#3b6cb5 100%)', 'Internal')}

      <div style="padding:36px 32px;">
        ${detailsCard('Visitor', 'linear-gradient(135deg,#1e3a5f 0%,#2c5282 100%)', [
          { label: 'Name', value: safe.name },
          { label: 'Phone', value: `<a href="tel:${safe.phone}" style="color:#2c5282;text-decoration:none;">${safe.phone}</a>` },
          { label: 'Email', value: `<a href="mailto:${safe.email}" style="color:#2c5282;text-decoration:none;">${safe.email}</a>` },
        ])}

        ${detailsCard('Body shop requested', 'linear-gradient(135deg,#92400e 0%,#b45309 100%)', [
          { label: 'Shop', value: safe.shop },
          { label: 'Type', value: escapeHtml(shop.kind) },
          ...(place ? [{ label: 'Location', value: escapeHtml(place) }] : []),
          { label: 'Shop phone', value: escapeHtml(shop.phone) },
          ...(shop.website ? [{ label: 'Website', value: escapeHtml(shop.website) }] : []),
          { label: 'Address', value: escapeHtml(shop.address) },
          { label: 'Directory id', value: escapeHtml(shop.id) },
        ])}

        ${ctaButton('View in Admin Dashboard', `${COMPANY_DOMAIN}/admin/contacts`, 'linear-gradient(135deg,#1e3a5f 0%,#2c5282 100%)', 'rgba(44,82,130,0.35)')}
      </div>

      ${footer('Internal automated notification from the public body shops directory.')}
    `),
  })
}
