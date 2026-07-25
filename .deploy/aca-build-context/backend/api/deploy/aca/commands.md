# ACA Deployment Commands

## ACR build and push

```powershell
az acr build --registry <ACR_NAME> --image wave9-backend-api:<TAG> --file backend/api/Dockerfile .
```

## Deploy or update Container App from manifest

```powershell
az containerapp update --name <APP_NAME> --resource-group <RG> --yaml backend/api/deploy/aca/containerapp.yaml
```

## Set container app secrets

```powershell
az containerapp secret set --name <APP_NAME> --resource-group <RG> --secrets \
  azure-storage-connection-string="<AZURE_STORAGE_CONNECTION_STRING>" \
  openai-endpoint="<OPENAI_ENDPOINT>" \
  openai-api-key="<OPENAI_API_KEY>" \
  di-endpoint="<DI_ENDPOINT>" \
  di-key="<DI_KEY>"
```

## Roll out a new revision explicitly

```powershell
az containerapp revision copy --name <APP_NAME> --resource-group <RG> --revision-suffix wave9-<TAG>
```

## Shift traffic to the latest revision

```powershell
az containerapp ingress traffic set --name <APP_NAME> --resource-group <RG> --revision-weight latest=100
```
