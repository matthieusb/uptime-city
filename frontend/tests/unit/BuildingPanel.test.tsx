import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import BuildingPanel from '../../src/city/BuildingPanel'

afterEach(cleanup)

const badge = { text: 'VM', color: '#4fa6e0' }

it('shows the building name and badge', () => {
  render(
    <BuildingPanel
      name="media-vm"
      badge={badge}
      floors={[]}
      ground={{ id: 'media-vm', name: 'media-vm', status: 'up' }}
    />,
  )

  const header = within(screen.getByTestId('building-panel')).getByText(
    'media-vm',
    { selector: '.building-panel-title' },
  )
  expect(header).toBeTruthy()
  expect(screen.getByText('VM')).toBeTruthy()
})

it('lists every floor from the top down, with its status, the host last', () => {
  render(
    <BuildingPanel
      name="media-vm"
      badge={badge}
      floors={[
        { id: 'a', name: 'audiobookshelf', status: 'up' },
        { id: 'b', name: 'freshrss', status: 'down' },
        { id: 'c', name: 'karakeep', status: 'unknown' },
      ]}
      ground={{ id: 'media-vm', name: 'media-vm', status: 'up' }}
    />,
  )

  const rows = screen.getAllByRole('listitem').map((li) => li.textContent)
  expect(rows).toEqual([
    'audiobookshelfup',
    'freshrssdown',
    'karakeepunknown',
    'media-vm (host)up',
  ])
})
