import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import axios from 'axios'
import Dashboard from '../pages/Dashboard'

jest.mock('axios')

// window.location.href est utilisé pour la redirection (pas react-router ici) :
// jsdom ne l'implémente pas nativement en écriture, on le remplace par un mock
// espionnable pour vérifier les redirections sans naviguer réellement.
delete window.location
window.location = { href: '' }

beforeEach(() => {
  localStorage.clear()
  window.location.href = ''
  jest.clearAllMocks()
})

describe('Dashboard — accès direct sans session (scénario 11 du plan de tests)', () => {
  test('redirige vers / si aucun token en localStorage, sans appeler l\'API', () => {
    render(<Dashboard />)
    expect(window.location.href).toBe('/')
    expect(axios.get).not.toHaveBeenCalled()
  })
})

describe('Dashboard — connexion réussie (scénario 9 du plan de tests)', () => {
  beforeEach(() => {
    localStorage.setItem('hrflow_token', 'valid-token')
    localStorage.setItem('hrflow_user', JSON.stringify({ id: 1, email: 'test@novatech.fr' }))
  })

  test('affiche le solde de congés retourné par l\'API', async () => {
    axios.get.mockResolvedValueOnce({ data: { solde: 18, joursAcquis: 25, joursPris: 7 } })
    render(<Dashboard />)
    expect(await screen.findByText('18')).toBeInTheDocument()
    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining('/conges/solde/1'),
      expect.objectContaining({ headers: { Authorization: 'Bearer valid-token' } })
    )
  })

  test('affiche l\'email de l\'utilisateur connecté', async () => {
    axios.get.mockResolvedValueOnce({ data: { solde: 25 } })
    render(<Dashboard />)
    expect(await screen.findByText('test@novatech.fr')).toBeInTheDocument()
  })

  test('affiche un skeleton de chargement avant la réponse API', () => {
    axios.get.mockReturnValue(new Promise(() => {})) // jamais résolue
    const { container } = render(<Dashboard />)
    expect(container.querySelector('.skeleton')).toBeInTheDocument()
  })
})

describe('Dashboard — token expiré (401 de l\'API)', () => {
  test('nettoie le localStorage et redirige vers / si l\'API renvoie 401', async () => {
    localStorage.setItem('hrflow_token', 'expired-token')
    localStorage.setItem('hrflow_user', JSON.stringify({ id: 1, email: 'test@novatech.fr' }))
    axios.get.mockRejectedValueOnce({ response: { status: 401 } })

    render(<Dashboard />)

    await waitFor(() => expect(window.location.href).toBe('/'))
    expect(localStorage.getItem('hrflow_token')).toBeNull()
    expect(localStorage.getItem('hrflow_user')).toBeNull()
  })

  test('ne nettoie pas la session sur une erreur autre que 401 (ex. 500, réseau)', async () => {
    localStorage.setItem('hrflow_token', 'valid-token')
    localStorage.setItem('hrflow_user', JSON.stringify({ id: 1, email: 'test@novatech.fr' }))
    axios.get.mockRejectedValueOnce({ response: { status: 500 } })

    render(<Dashboard />)

    await waitFor(() => expect(axios.get).toHaveBeenCalled())
    expect(localStorage.getItem('hrflow_token')).toBe('valid-token')
    expect(window.location.href).toBe('')
  })
})

describe('Dashboard — déconnexion', () => {
  test('le bouton Déconnexion vide le localStorage et redirige vers /', async () => {
    localStorage.setItem('hrflow_token', 'valid-token')
    localStorage.setItem('hrflow_user', JSON.stringify({ id: 1, email: 'test@novatech.fr' }))
    axios.get.mockResolvedValueOnce({ data: { solde: 25 } })

    render(<Dashboard />)
    await screen.findByText('test@novatech.fr')

    fireEvent.click(screen.getByRole('button', { name: /Déconnexion/i }))

    expect(localStorage.getItem('hrflow_token')).toBeNull()
    expect(localStorage.getItem('hrflow_user')).toBeNull()
    expect(window.location.href).toBe('/')
  })
})
