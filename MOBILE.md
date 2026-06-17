# Manutenção INJOY — Publicação nas lojas (Android & iOS)

Este projeto usa [Capacitor](https://capacitorjs.com/) para empacotar o app web como aplicativo nativo na **Google Play** e na **App Store**.

> Toda a engenharia abaixo precisa ser feita **fora do Lovable**, no seu computador, porque a compilação nativa exige Android Studio (Android) e Xcode em um Mac (iOS).

---

## 1. Pré-requisitos

| Plataforma | Necessário |
|---|---|
| Android | [Android Studio](https://developer.android.com/studio) + conta no [Google Play Console](https://play.google.com/console) (US$ 25, taxa única) |
| iOS | macOS + [Xcode](https://apps.apple.com/app/xcode/id497799835) + [Apple Developer Program](https://developer.apple.com/programs/) (US$ 99/ano) |
| Ambos | [Node.js LTS](https://nodejs.org/) e [Git](https://git-scm.com/) |

---

## 2. Exportar o projeto do Lovable para o seu computador

1. No editor do Lovable, clique em **GitHub → Connect to GitHub** e crie o repositório.
2. Clone localmente:
   ```bash
   git clone https://github.com/<seu-usuario>/<seu-repo>.git
   cd <seu-repo>
   npm install
   ```

Sempre que alterar o app aqui no Lovable: `git pull` no seu computador para receber as mudanças.

---

## 3. Adicionar as plataformas nativas (uma única vez)

```bash
npx cap add android
npx cap add ios          # somente em Mac
```

Isso cria as pastas `android/` e `ios/` com os projetos nativos. **Commit dessas pastas no Git.**

---

## 4. Gerar ícones e splash screens

O logo INJOY já está em `resources/icon.png` (1024×1024) e `resources/splash.png` (2732×2732). Para gerar todos os tamanhos exigidos pelas lojas:

```bash
npx capacitor-assets generate --iconBackgroundColor "#0c5a64" --splashBackgroundColor "#0c5a64"
```

---

## 5. Configuração de produção (IMPORTANTE)

O `capacitor.config.ts` está apontando para o preview do Lovable (hot-reload no celular durante o desenvolvimento). **Antes de gerar a build para as lojas, remova o bloco `server`**:

```ts
// capacitor.config.ts (versão de produção)
const config: CapacitorConfig = {
  appId: 'com.injoy.manutencao',
  appName: 'Manutenção INJOY',
  webDir: 'dist',
  android: { backgroundColor: '#0c5a64' },
  ios: { backgroundColor: '#0c5a64', contentInset: 'always' },
};
```

> Dica: mantenha duas versões locais ou use uma variável de ambiente para alternar.

---

## 6. Ciclo de build/sync

Toda vez que houver mudança no código web:

```bash
git pull
npm install            # se package.json mudou
npm run build          # gera dist/
npx cap sync           # copia dist/ para android/ e ios/
```

---

## 7. Publicar no Google Play (Android)

```bash
npx cap open android
```

No Android Studio:
1. **Build → Generate Signed Bundle / APK → Android App Bundle (.aab)**.
2. Crie/escolha a sua **keystore** (guarde-a em local seguro — sem ela você não consegue atualizar o app).
3. No [Google Play Console](https://play.google.com/console): criar app → enviar `.aab` → preencher fichas de loja, política de privacidade e classificação etária.

---

## 8. Publicar na App Store (iOS)

```bash
npx cap open ios
```

No Xcode (apenas em Mac):
1. Selecione o **Team** do seu Apple Developer Program em *Signing & Capabilities*.
2. **Product → Archive**.
3. Janela *Organizer* → **Distribute App → App Store Connect**.
4. No [App Store Connect](https://appstoreconnect.apple.com): criar app com o bundle id `com.injoy.manutencao` → submeter o build para revisão.

---

## 9. Permissões e plugins úteis

Se o app for usar câmera (fotos de chamado direto do celular), instale:

```bash
npm i @capacitor/camera
npx cap sync
```

E adicione as descrições de uso nas `Info.plist` (iOS) e `AndroidManifest.xml` (Android) conforme a documentação oficial: <https://capacitorjs.com/docs/apis/camera>.

---

## Resumo dos comandos diários

```bash
git pull
npm install
npm run build
npx cap sync
npx cap open android   # ou: npx cap open ios
```

Pronto — depois é só gerar o build assinado na IDE nativa e enviar para a loja correspondente.
