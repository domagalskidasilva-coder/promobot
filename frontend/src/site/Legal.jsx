// Páginas legais (LGPD + disclosure de afiliado).
import { Page, PageHeader } from "../components/ui"
import { useDocTitle } from "./components"

export function PrivacyPage({ disclosure }) {
  useDocTitle("Privacidade")
  return (
    <Page labelledBy="page-title">
      <PageHeader title="Política de Privacidade" description="Última atualização: 2026." />
      <div className="card-pad max-w-3xl space-y-3 text-sm leading-relaxed text-slate-700">
        <p><b>O que coletamos.</b> Sem conta: só dados técnicos anônimos de navegação e o consentimento de cookies. Com conta (Google): nome, e-mail, foto de perfil, favoritos e alertas de preço que você criar.</p>
        <p><b>Para que usamos.</b> Manter sua sessão, exibir favoritos e enviar por e-mail os alertas de preço que você configurou. Nada de spam: cada alerta respeita no máximo 1 envio a cada 24 h por produto.</p>
        <p><b>Cookies.</b> Sessão (essencial, expira em 30 dias) e preferência do banner de cookies. Sem rastreadores de terceiros.</p>
        <p><b>Afiliados.</b> {disclosure || "Links de oferta podem gerar comissão para o Promobot, sem custo para você."}</p>
        <p><b>Seus direitos (LGPD, art. 18).</b> A qualquer momento, em <b>Conta</b>, você pode corrigir seu nome e <b>excluir sua conta</b> — o que apaga cadastro, favoritos e alertas.</p>
      </div>
    </Page>
  )
}

export function TermsPage({ disclosure }) {
  useDocTitle("Termos")
  return (
    <Page labelledBy="page-title">
      <PageHeader title="Termos de Uso" description="Última atualização: 2026." />
      <div className="card-pad max-w-3xl space-y-3 text-sm leading-relaxed text-slate-700">
        <p><b>O que é.</b> Vitrine de ofertas coletadas automaticamente nos marketplaces, com histórico de preços e análise automática (que pode conter erros — confira sempre na loja).</p>
        <p><b>Preços.</b> Coletados por robô e sujeitos a mudança a qualquer momento. O preço válido é sempre o do checkout da loja.</p>
        <p><b>Compra.</b> A compra acontece no site da loja. O Promobot não vende, não entrega e não se responsabiliza por pedidos, trocas ou garantias.</p>
        <p><b>Afiliados.</b> {disclosure || "Parte dos links gera comissão para manter o serviço no ar, sem custo adicional para você."}</p>
        <p><b>Conta.</b> Uso pessoal. Não compartilhe sessões; podemos desativar contas em caso de abuso (ex.: robôs criando alertas em massa).</p>
      </div>
    </Page>
  )
}
