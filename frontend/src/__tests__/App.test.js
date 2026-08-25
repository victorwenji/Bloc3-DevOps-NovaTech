import React from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import App from '../App'

// Login et Dashboard ont leurs propres suites de tests dédiées (login.test.js,
// Dashboard.test.js) ; ici on vérifie uniquement le contrat de routage.
jest.mock('../components/Login', () => () => <div>Login Page</div>)
jest.mock('../pages/Dashboard', () => () => <div>Dashboard Page</div>)

function renderAt(path) {
  window.history.pushState({}, '', path)
  return render(<App />)
}

describe('App — routage', () => {
  test('affiche Login sur /', () => {
    renderAt('/')
    expect(screen.getByText('Login Page')).toBeInTheDocument()
  })

  test('affiche Dashboard sur /dashboard', () => {
    renderAt('/dashboard')
    expect(screen.getByText('Dashboard Page')).toBeInTheDocument()
  })
})
