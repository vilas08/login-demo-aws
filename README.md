# login-demo-aws

3-stage (dev / staging / prod) full-stack login app.

- **Backend + hosting infra:** AWS SAM / CloudFormation (`template.yaml`), deployed manually with `sam`
- **Frontend:** React + Vite, deployed by GitHub Actions to S3 + CloudFront
- **Stages:** one CloudFormation stack per stage, same template

| Git branch | Stage   | Stack                       | samconfig env |
|------------|---------|-----------------------------|---------------|
| `dev`      | dev     | `login-demo-dev-vilas`      | `dev`         |
| `staging`  | staging | `login-demo-staging-vilas`  | `staging`     |
| `main`     | prod    | `login-demo-prod-vilas`     | `prod`        |

API: `POST /register`, `POST /login`, `GET /me` (Bearer token).

## 1. Deploy the backend + hosting (per stage)

Prereqs: AWS CLI configured (`aws configure`), SAM CLI, Node 22.

```bash
sam validate --lint
sam build
sam deploy --config-env dev        # then staging, then prod
```

Check outputs:

```bash
aws cloudformation describe-stacks --stack-name login-demo-dev-vilas \
  --query "Stacks[0].Outputs" --output table
```

You get `ApiUrl`, `SiteUrl`, `BucketName`, `DistributionId`.

Quick API test:

```bash
curl -X POST <ApiUrl>/register -H "Content-Type: application/json" \
  -d '{"email":"a@b.com","password":"secret123"}'
curl -X POST <ApiUrl>/login -H "Content-Type: application/json" \
  -d '{"email":"a@b.com","password":"secret123"}'
```

## 2. One-time AWS setup for GitHub CI/CD

1. IAM -> Identity providers -> Add provider -> OpenID Connect
   - Provider URL: `https://token.actions.githubusercontent.com`
   - Audience: `sts.amazonaws.com`
2. IAM -> Roles -> Create role -> Custom trust policy -> paste `iam/github-trust-policy.json`
   (replace `<ACCOUNT_ID>`). Name it e.g. `github-login-demo-frontend-vilas`.
3. Add an inline policy to the role from `iam/github-deploy-policy.json` (replace `<ACCOUNT_ID>`).
4. Copy the role ARN.

## 3. GitHub setup

1. Push this repo with branches `main`, `staging`, `dev`.
2. Settings -> Environments -> create `dev`, `staging`, `prod`.
3. In each environment add secret `AWS_ROLE_ARN` = the role ARN.
4. In `prod`, enable **Required reviewers** (manual approval before prod deploy).
5. Settings -> Branches -> protect `main` (require pull request).

## 4. Deploy the frontend

Push a change under `frontend/` to a branch:

- push to `dev` -> deploys to dev
- merge `dev` -> `staging` -> deploys to staging
- merge `staging` -> `main` -> approve -> deploys to prod

The workflow reads the stack outputs, builds Vite with `VITE_API_URL` set to that stage's API,
syncs `dist` to S3 and invalidates CloudFront. You can also run it manually from the Actions tab
(**Run workflow**).

Open the `SiteUrl` output to use the app.

## Local development

```bash
cd frontend
cp .env.example .env.local     # put the dev ApiUrl in it
npm install
npm run dev                    # http://localhost:5173 (allowed by API CORS)
```

## Cleanup

Empty the bucket first, otherwise stack deletion fails:

```bash
aws s3 rm s3://<BucketName> --recursive
sam delete --stack-name login-demo-dev-vilas --region us-east-1
```
Secrets Manager secrets are deleted with the stack (they may remain scheduled for deletion for a few days).

## Notes

- Everything is suffixed `-vilas` so it is easy to find and delete.
- Password hashing uses Node `crypto.scrypt`; the token is a simple HMAC-signed token (1 hour).
  For real production use Amazon Cognito.
- For prod, tighten CORS and consider separate AWS accounts per stage.
